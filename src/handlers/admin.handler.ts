
import { Markup, Telegraf } from 'telegraf';
import { config } from '../config';

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
// Admin keyboard helpers
// ============================================================

function pendingListingKeyboard(
  listingId: string
) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        '✏️ ပြင်ဆင်မည်',
        `edit:${listingId}`
      ),
    ],
    [
      Markup.button.callback(
        '✅ အတည်ပြုမည်',
        `approve:${listingId}`
      ),
      Markup.button.callback(
        '❌ ငြင်းပယ်မည်',
        `reject:${listingId}`
      ),
    ],
  ]);
}

function availabilityKeyboard(
  listingId: string,
  isAvailable: boolean
) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isAvailable
          ? '🔴 Sold Out'
          : '🟢 Available',
        isAvailable
          ? `soldout:${listingId}`
          : `available:${listingId}`
      ),
    ],
  ]);
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
            result.message +
              `\n\n🟢 <b>Status: Available</b>`,
            {
              parse_mode: 'HTML',

              ...availabilityKeyboard(
                listingId,
                true
              ),
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

      await ctx.reply(
        `❌ ပယ်ဖျက်မည် - ID: ${listingId}\n\n` +
        `ပယ်ဖျက်ရသည့် အကြောင်းပြချက်ကို ရေးပေးပါ -`,
        {
          ...Markup.forceReply(),

          reply_parameters: {
            message_id:
              controlMessage.message_id,
          },
        }
      );
    }
  );

  // ==========================================================
  // Mark listing as SOLD OUT
  // ==========================================================

  bot.action(
    /^soldout:(.+)$/,
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
          '⏳ Sold Out ပြောင်းနေပါသည်...'
        )
        .catch(() => {});

      const listingId =
        ctx.match[1];

      const controlMessage =
        ctx.callbackQuery.message;

      const chatId =
        ctx.chat?.id;

      if (
        !controlMessage ||
        chatId === undefined
      ) {
        return;
      }

      try {

        const result =
          await listingService.markAsSoldOut(
            listingId
          );

        await ctx.telegram.editMessageText(
          chatId,
          controlMessage.message_id,
          undefined,
          result.message +
            `\n\n🔴 <b>Status: Sold Out</b>`,
          {
            parse_mode: 'HTML',

            ...availabilityKeyboard(
              listingId,
              false
            ),
          }
        );

      } catch (error) {

        console.error(
          '❌ Admin sold-out error:',
          error
        );

        await ctx
          .answerCbQuery(
            error instanceof Error
              ? `❌ ${error.message}`
              : '❌ Sold Out ပြောင်း၍ မရပါ။',
            {
              show_alert: true,
            }
          )
          .catch(() => {});
      }
    }
  );

  // ==========================================================
  // Mark listing as AVAILABLE
  // ==========================================================

  bot.action(
    /^available:(.+)$/,
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
          '⏳ Available ပြောင်းနေပါသည်...'
        )
        .catch(() => {});

      const listingId =
        ctx.match[1];

      const controlMessage =
        ctx.callbackQuery.message;

      const chatId =
        ctx.chat?.id;

      if (
        !controlMessage ||
        chatId === undefined
      ) {
        return;
      }

      try {

        const result =
          await listingService.markAsAvailable(
            listingId
          );

        await ctx.telegram.editMessageText(
          chatId,
          controlMessage.message_id,
          undefined,
          result.message +
            `\n\n🟢 <b>Status: Available</b>`,
          {
            parse_mode: 'HTML',

            ...availabilityKeyboard(
              listingId,
              true
            ),
          }
        );

      } catch (error) {

        console.error(
          '❌ Admin available error:',
          error
        );

        await ctx
          .answerCbQuery(
            error instanceof Error
              ? `❌ ${error.message}`
              : '❌ Available ပြောင်း၍ မရပါ။',
            {
              show_alert: true,
            }
          )
          .catch(() => {});
      }
    }
  );

  // ==========================================================
  // Rejection reason
  // ==========================================================

  bot.on(
    'text',
    async (ctx, next) => {

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
       * The rejection prompt contains two lines:
       *
       * ❌ ပယ်ဖျက်မည် - ID: <listingId>
       *
       * ပယ်ဖျက်ရသည့် အကြောင်းပြချက်ကို ရေးပေးပါ -
       *
       * We only need the first line to identify
       * the listing.
       */

      const replyText =
        'text' in repliedMessage
          ? repliedMessage.text
          : '';

      const firstLine =
        replyText
          .split('\n')[0]
          .trim();

      const match =
        firstLine.match(
          /^❌ ပယ်ဖျက်မည် - ID: (.+)$/
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
         * The admin's reason message replies to the
         * rejection prompt.
         *
         * The rejection prompt replies to the
         * original control message.
         *
         * Therefore:
         *
         * reason message
         *      ↓
         * rejection prompt
         *      ↓
         * control message
         */

        const rejectionPromptData =
          repliedMessage as unknown as {
            reply_to_message?: {
              message_id: number;
            };
          };

        const controlMessageId =
          rejectionPromptData
            .reply_to_message
            ?.message_id;

        if (
          controlMessageId === undefined
        ) {

          console.error(
            '❌ Could not find control message ID for rejection.'
          );

          /*
           * The database rejection already succeeded.
           *
           * Do not silently hide the success from
           * the admin.
           */

          await ctx.reply(
            result.message,
            {
              parse_mode: 'HTML',
            }
          );

          return;
        }

        // ====================================================
        // Update original control message
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

          /*
           * Database rejection succeeded.
           *
           * Only the Telegram UI update failed.
           */

          await ctx.reply(
            result.message,
            {
              parse_mode: 'HTML',
            }
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

