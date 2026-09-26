import { Markup, Telegraf } from 'telegraf';

import {
  MyContext,
} from '../types/listing';

import {
  isAdmin,
  isAdminChat,
} from '../middleware/adminAuth';

import {
  ListingService,
} from '../services/listing.service';

import {
  SettingService,
} from '../services/setting.service';

export function registerAdminHandlers(
  bot: Telegraf<MyContext>,
  listingService: ListingService,
  settingService: SettingService
) {

  // ==========================================================
  // /setrules
  // ==========================================================

  bot.command('setrules', async (ctx) => {

    if (!isAdmin(ctx)) {
      return ctx.reply(
        '⚠️ ဤ Command ကို အုပ်ထိန်းသူများသာ အသုံးပြုခွင့်ရှိပါသည်။'
      );
    }

    const commandText =
      ctx.message.text;

    const newRules =
      commandText
        .replace(/^\/setrules\s*/, '')
        .trim();

    if (!newRules) {
      const currentRules =
        await settingService.getRules();

      return ctx.reply(
        `⚠️ စည်းကမ်းချက်အသစ် ထည့်သွင်းပေးပါ။\n\n` +
        `အသုံးပြုပုံ:\n` +
        `/setrules စည်းကမ်းချက်အသစ် စာသားများ...\n\n` +
        `လက်ရှိ စည်းကမ်းချက်များ:\n\n` +
        currentRules
      );
    }

    try {
      await settingService.updateRules(
        newRules
      );

      await ctx.reply(
        '✅ စည်းကမ်းချက်များကို အောင်မြင်စွာ ပြောင်းလဲပြီးပါပြီ။'
      );
    } catch (error) {
      console.error(
        '❌ Failed to update rules:',
        error
      );

      await ctx.reply(
        '❌ စည်းကမ်းချက်များ ပြောင်းလဲရာတွင် အမှားအယွင်း ရှိနေပါသည်။'
      );
    }
  });

  // ==========================================================
  // Approve listing
  // ==========================================================

  bot.action(
    /^approve:(.+)$/,
    async (ctx) => {

      if (!isAdmin(ctx)) {
        await ctx
          .answerCbQuery(
            '⚠️ ဤခလုတ်ကို အုပ်ထိန်းသူများသာ နှိပ်ခွင့်ရှိပါသည်။',
            {
              show_alert: true,
            }
          )
          .catch(() => {});

        return;
      }

      await ctx
        .answerCbQuery(
          '⏳ အတည်ပြုနေပါသည်...'
        )
        .catch(() => {});

      const listingId =
        ctx.match[1];

      try {
        const result =
          await listingService
            .approveListing(
              listingId
            );

        const controlMessage =
          ctx.callbackQuery.message;

        if (!controlMessage) {
          return;
        }

        const chatId =
          ctx.chat?.id;

        if (chatId === undefined) {
          return;
        }

        try {
          await ctx.telegram.editMessageText(
            chatId,
            controlMessage.message_id,
            undefined,
            result.message,
            {
              parse_mode: 'HTML',
            }
          );
        } catch (error) {
          console.error(
            '❌ Failed to update approve control message:',
            error
          );
        }

      } catch (error) {

        console.error(
          '❌ Admin approve error:',
          error
        );

        await ctx
          .answerCbQuery(
            error instanceof Error
              ? `❌ ${error.message}`
              : '❌ အတည်ပြု၍ မရပါ။',
            {
              show_alert: true,
            }
          )
          .catch(() => {});
      }
    }
  );

  // ==========================================================
  // Reject listing
  // ==========================================================

  bot.action(
    /^reject:(.+)$/,
    async (ctx) => {

      if (!isAdmin(ctx)) {
        await ctx
          .answerCbQuery(
            '⚠️ ဤခလုတ်ကို အုပ်ထိန်းသူများသာ နှိပ်ခွင့်ရှိပါသည်။',
            {
              show_alert: true,
            }
          )
          .catch(() => {});

        return;
      }

      await ctx
        .answerCbQuery()
        .catch(() => {});

      const listingId =
        ctx.match[1];

      const controlMessage =
        ctx.callbackQuery.message;

      if (!controlMessage) {
        return;
      }

      /*
       * The listing ID is stored directly in the
       * rejection prompt.
       *
       * We also reply to the original control message
       * so the admin can clearly see which listing they
       * are responding to.
       */

      try {
        await ctx.reply(
          `❌ <b>ပယ်ဖျက်မည်</b>\n\n` +
          `ID: <code>${listingId}</code>\n\n` +
          `ပယ်ဖျက်ရသည့် အကြောင်းပြချက်ကို ရေးပေးပါ -`,
          {
            parse_mode: 'HTML',

            ...Markup.forceReply(),

            reply_parameters: {
              message_id:
                controlMessage.message_id,
            },
          }
        );
      } catch (error) {

        console.error(
          '❌ Failed to send rejection prompt:',
          error
        );
      }
    }
  );

  // ==========================================================
  // Rejection reason
  // ==========================================================

  bot.on(
    'text',
    async (ctx, next) => {

      /*
       * Only process rejection replies from:
       *
       * 1. An admin
       * 2. The admin chat
       * 3. A message that replies to another message
       */

      if (
        !isAdmin(ctx) ||
        !isAdminChat(ctx) ||
        !('reply_to_message' in ctx.message)
      ) {
        return next();
      }

      const chatId =
        ctx.chat?.id;

      if (chatId === undefined) {
        return next();
      }

      const repliedMessage =
        ctx.message.reply_to_message;

      if (!repliedMessage) {
        return next();
      }

      /*
       * Telegram's reply_to_message can contain either
       * text or a caption depending on the message type.
       *
       * Our rejection prompt is always a text message,
       * so we only need the text field here.
       */

      const replyText =
        'text' in repliedMessage
          ? repliedMessage.text
          : '';

      /*
       * Expected rejection prompt:
       *
       * ❌ ပယ်ဖျက်မည်
       *
       * ID: <listing-id>
       *
       * ...
       *
       * We only need to extract the ID.
       */

      const match =
        replyText.match(
          /ID:\s*(?:<code>)?([^<\s]+)(?:<\/code>)?/
        );

      if (!match) {
        return next();
      }

      const listingId =
        match[1].trim();

      const reason =
        ctx.message.text.trim();

      if (!reason) {
        await ctx.reply(
          '⚠️ အကြောင်းပြချက် မရှိပါ။'
        );

        return;
      }

      // ======================================================
      // Reject listing
      // ======================================================

      try {
        const result =
          await listingService
            .rejectListing(
              listingId,
              reason
            );

        /*
         * The admin's rejection reason message is itself
         * a reply to the rejection prompt.
         *
         * We already know the original control message is
         * the message that the rejection prompt replied to.
         *
         * Instead of using an unsafe TypeScript cast,
         * Telegram's reply structure is checked safely.
         */

        const rejectionPrompt =
          repliedMessage;

        if (
          !('reply_to_message' in rejectionPrompt)
        ) {
          console.error(
            '❌ Rejection prompt does not contain the original control message.'
          );

          return;
        }

        const originalMessage =
          rejectionPrompt.reply_to_message;

        if (!originalMessage) {
          console.error(
            '❌ Could not find original control message for rejection.'
          );

          return;
        }

        const controlMessageId =
          originalMessage.message_id;

        // ====================================================
        // Update admin control message
        // ====================================================

        try {
          await ctx.telegram.editMessageText(
            chatId,
            controlMessageId,
            undefined,
            result.message,
            {
              parse_mode: 'HTML',
            }
          );
        } catch (error) {

          console.error(
            '❌ Failed to update rejection control message:',
            error
          );
        }

      } catch (error) {

        console.error(
          '❌ Admin reject error:',
          error
        );

        await ctx.reply(
          error instanceof Error
            ? `❌ ${error.message}`
            : '❌ ပစ္စည်းပယ်ဖျက်ရာတွင် အမှားဖြစ်နေပါသည်။'
        );
      }
    }
  );
}