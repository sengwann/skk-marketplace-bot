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

// ============================================================
// Rejection prompt data
// ============================================================

interface RejectionPromptData {
  listingId: string;
  controlMessageId: number;
}

// ============================================================
// Extract rejection prompt data
// ============================================================

function parseRejectionPrompt(
  text: string
): RejectionPromptData | null {
  /*
   * Expected format:
   *
   * ❌ ပယ်ဖျက်မည်
   *
   * ID: <listing-id>
   *
   * ပယ်ဖျက်ရသည့် အကြောင်းပြချက်ကို ရေးပေးပါ -
   */

  const match =
    text.match(
      /ID:\s*(?:<code>)?([^<\s]+)(?:<\/code>)?/
    );

  if (!match) {
    return null;
  }

  return {
    listingId:
      match[1].trim(),

    controlMessageId:
      0,
  };
}

// ============================================================
// Admin handlers
// ============================================================

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

      // ------------------------------------------------------
      // Only admins in the admin chat
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // Get text from the message being replied to
      // ------------------------------------------------------

      const replyText =
        'text' in repliedMessage
          ? repliedMessage.text
          : '';

      if (!replyText) {
        return next();
      }

      // ------------------------------------------------------
      // Check whether this is our rejection prompt
      // ------------------------------------------------------

      const promptData =
        parseRejectionPrompt(
          replyText
        );

      if (!promptData) {
        return next();
      }

      const listingId =
        promptData.listingId;

      const reason =
        ctx.message.text.trim();

      if (!reason) {
        await ctx.reply(
          '⚠️ အကြောင်းပြချက် မရှိပါ။'
        );

        return;
      }

      // ------------------------------------------------------
      // Reject listing
      // ------------------------------------------------------

      try {

        const result =
          await listingService
            .rejectListing(
              listingId,
              reason
            );

        /*
         * The rejection prompt was created as a reply
         * to the original admin control message.
         *
         * Telegraf's TypeScript definitions can narrow
         * reply_to_message differently depending on the
         * message union type, so we use a small, local
         * structural check here.
         */

        const rejectionPromptWithReply =
          repliedMessage as {
            message_id: number;
            reply_to_message?: {
              message_id: number;
            };
          };

        const controlMessageId =
          rejectionPromptWithReply
            .reply_to_message
            ?.message_id;

        if (
          controlMessageId === undefined
        ) {
          console.error(
            '❌ Could not find original control message ID for rejection.'
          );

          return;
        }

        // ----------------------------------------------------
        // Update original admin control message
        // ----------------------------------------------------

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