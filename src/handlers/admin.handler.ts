import { Markup, Telegraf } from "telegraf";

import {
  MyContext,
  MyWizardSession,
  Listing,
  AdminEditField,
  AdminEditSessionData,
  Category,
  Location,
  Currency,
} from "../types/listing";

import {
  isAuthorizedAdmin,
  isAuthorizedAdminUser,
} from "../middleware/adminAuth";

import { ListingService } from "../services/listing.service";

import { SettingService } from "../services/setting.service";

import { escapeHtml } from "../utils/htmlEscape";

// ============================================================
// Labels
// ============================================================

const categoryLabels: Record<Category, string> = {
  [Category.ELECTRONICS]: "Electronic",
  [Category.CLOTHING]: "Fashion",
  [Category.HOME]: "Home",
  [Category.VEHICLE]: "Vehicle",
  [Category.OTHER]: "Other",
};

const locationLabels: Record<Location, string> = {
  [Location.SHWE_KOKKO]: "ShweKok Ko",
  [Location.MYAWADDY]: "Myawaddy",
};

function getAdminSession(ctx: MyContext): MyWizardSession {
  return ctx.session as MyWizardSession;
}

// ============================================================
// Admin keyboards
// ============================================================

function pendingListingKeyboard(listingId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏️ ပြင်ဆင်မည်", `edit:${listingId}`)],
    [
      Markup.button.callback("✅ အတည်ပြုမည်", `approve:${listingId}`),

      Markup.button.callback("❌ ငြင်းပယ်မည်", `reject:${listingId}`),
    ],
  ]);
}

// ============================================================
// Availability keyboard
// ============================================================

function availabilityKeyboard(listingId: string, isAvailable: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isAvailable ? "🔴 Sold Out" : "🟢 Available",

        isAvailable ? `soldout:${listingId}` : `available:${listingId}`,
      ),
    ],
  ]);
}

// ============================================================
// Edit menu keyboard
// ============================================================

function editMenuKeyboard(listingId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "📦 ပစ္စည်းအမည်",
        `editfield:productName:${listingId}`,
      ),
    ],

    [
      Markup.button.callback("🏷️ အမျိုးအစား", `editcategory:${listingId}`),

      Markup.button.callback("📍 မြို့နယ်", `editlocation:${listingId}`),
    ],

    [
      Markup.button.callback("💰 ဈေးနှုန်း", `editprice:${listingId}`),

      Markup.button.callback("💵 Currency", `editcurrency:${listingId}`),
    ],

    [Markup.button.callback("📦 အခြေအနေ", `editfield:condition:${listingId}`)],

    [
      Markup.button.callback("📝 မှတ်ချက်", `editfield:note:${listingId}`),

      Markup.button.callback("📞 ဆက်သွယ်ရန်", `editfield:contact:${listingId}`),
    ],

    [Markup.button.callback("👀 Preview", `editpreview:${listingId}`)],

    [
      Markup.button.callback("💾 Save", `editsave:${listingId}`),

      Markup.button.callback("❌ Cancel", `editcancel:${listingId}`),
    ],
  ]);
}

// ============================================================
// Category keyboard
// ============================================================

function categoryKeyboard(listingId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "💻 Electronic",
        `editcat:${Category.ELECTRONICS}:${listingId}`,
      ),

      Markup.button.callback(
        "👕 Fashion",
        `editcat:${Category.CLOTHING}:${listingId}`,
      ),
    ],

    [
      Markup.button.callback(
        "🏠 Home",
        `editcat:${Category.HOME}:${listingId}`,
      ),

      Markup.button.callback(
        "🚗 Vehicle",
        `editcat:${Category.VEHICLE}:${listingId}`,
      ),
    ],

    [
      Markup.button.callback(
        "📦 Other",
        `editcat:${Category.OTHER}:${listingId}`,
      ),
    ],

    [Markup.button.callback("⬅️ Back", `editback:${listingId}`)],
  ]);
}

// ============================================================
// Location keyboard
// ============================================================

function locationKeyboard(listingId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "📍 ShweKok Ko",
        `editloc:${Location.SHWE_KOKKO}:${listingId}`,
      ),

      Markup.button.callback(
        "📍 Myawaddy",
        `editloc:${Location.MYAWADDY}:${listingId}`,
      ),
    ],

    [Markup.button.callback("⬅️ Back", `editback:${listingId}`)],
  ]);
}

// ============================================================
// Currency keyboard
// ============================================================

function currencyKeyboard(listingId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🇲🇲 MMK", `editcur:MMK:${listingId}`),

      Markup.button.callback("🇹🇭 THB", `editcur:THB:${listingId}`),
    ],

    [Markup.button.callback("⬅️ Back", `editback:${listingId}`)],
  ]);
}

// ============================================================
// Admin preview
// ============================================================

function buildAdminPreview(
  listing: Listing,
  draft: AdminEditSessionData,
): string {
  const category = categoryLabels[draft.category] ?? draft.category;

  const location = locationLabels[draft.location] ?? draft.location;

  const noteSection = draft.note
    ? `\n📝 <b>မှတ်ချက်:</b> ` + `${escapeHtml(draft.note)}\n`
    : "";

  const seller = listing.sellerUsername
    ? `@${escapeHtml(listing.sellerUsername)}`
    : "မရှိပါ";

  return (
    `<b>👀 Preview - ပြင်ဆင်ထားသော ပစ္စည်း</b>\n\n` +
    `📦 <b>ပစ္စည်းအမည်:</b> ` +
    `${escapeHtml(draft.productName)}\n` +
    `🏷️ <b>အမျိုးအစား:</b> ` +
    `${escapeHtml(category)}\n` +
    `📍 <b>မြို့နယ်:</b> ` +
    `${escapeHtml(location)}\n` +
    `💰 <b>ဈေးနှုန်း:</b> ` +
    `${escapeHtml(draft.price.priceAmount)} ` +
    `${escapeHtml(draft.price.currency)}\n` +
    `📦 <b>အခြေအနေ:</b> ` +
    `${escapeHtml(draft.condition)}\n` +
    noteSection +
    `📞 <b>ဆက်သွယ်ရန်:</b> ` +
    `${escapeHtml(draft.contact)}\n` +
    `👤 <b>ရောင်းသူ:</b> ` +
    `${seller}\n\n` +
    `⚠️ ဤ Preview သည် Draft ဖြစ်ပါသည်။\n` +
    `💾 Save မနှိပ်မချင်း Database ထဲသို့ မသိမ်းပါ။`
  );
}

// ============================================================
// Edit menu text
// ============================================================

function buildEditMenuText(draft: AdminEditSessionData): string {
  const category = categoryLabels[draft.category] ?? draft.category;

  const location = locationLabels[draft.location] ?? draft.location;

  return (
    `<b>✏️ ပစ္စည်းကို ပြင်ဆင်မည်</b>\n\n` +
    `📦 <b>ပစ္စည်းအမည်:</b> ` +
    `${escapeHtml(draft.productName)}\n` +
    `🏷️ <b>အမျိုးအစား:</b> ` +
    `${escapeHtml(category)}\n` +
    `📍 <b>မြို့နယ်:</b> ` +
    `${escapeHtml(location)}\n` +
    `💰 <b>ဈေးနှုန်း:</b> ` +
    `${escapeHtml(draft.price.priceAmount)} ` +
    `${escapeHtml(draft.price.currency)}\n` +
    `📦 <b>အခြေအနေ:</b> ` +
    `${escapeHtml(draft.condition)}\n` +
    `📝 <b>မှတ်ချက်:</b> ` +
    `${draft.note ? escapeHtml(draft.note) : "မရှိပါ"}\n` +
    `📞 <b>ဆက်သွယ်ရန်:</b> ` +
    `${escapeHtml(draft.contact)}\n\n` +
    `ပြင်လိုသောအချက်ကို ရွေးချယ်ပါ။`
  );
}

// ============================================================
// Pending result text
// ============================================================

function buildSavedText(listing: Listing): string {
  const category = categoryLabels[listing.category] ?? listing.category;

  const location = locationLabels[listing.location] ?? listing.location;

  const noteSection = listing.note
    ? `\n📝 <b>မှတ်ချက်:</b> ${escapeHtml(listing.note)}`
    : "";

  return (
    `<b>✅ ပြင်ဆင်ပြီးပါပြီ</b>\n\n` +
    `📦 <b>ပစ္စည်းအမည်:</b> ` +
    `${escapeHtml(listing.productName)}\n` +
    `🏷️ <b>အမျိုးအစား:</b> ` +
    `${escapeHtml(category)}\n` +
    `📍 <b>မြို့နယ်:</b> ` +
    `${escapeHtml(location)}\n` +
    `💰 <b>ဈေးနှုန်း:</b> ` +
    `${escapeHtml(listing.priceAmount)} ` +
    `${escapeHtml(listing.currency)}\n` +
    `📦 <b>အခြေအနေ:</b> ` +
    `${escapeHtml(listing.condition)}\n` +
    noteSection +
    `\n📞 <b>ဆက်သွယ်ရန်:</b> ` +
    `${escapeHtml(listing.contact)}\n\n` +
    `⏳ Listing သည် PENDING အခြေအနေတွင် ရှိနေပါသည်။\n` +
    `အတည်ပြုရန် အောက်ပါခလုတ်ကို နှိပ်ပါ။`
  );
}

// ============================================================
// Create edit draft
// ============================================================

function createEditDraft(
  listing: Listing,
  controlMessageId: number,
): AdminEditSessionData {
  return {
    listingId: listing.id,

    controlMessageId,

    productName: listing.productName,

    category: listing.category,

    location: listing.location,

    price: {
      priceAmount: listing.priceAmount,

      currency: listing.currency,
    },

    condition: listing.condition,

    note: listing.note,

    contact: listing.contact,
  };
}

// ============================================================
// Register handlers
// ============================================================

export function registerAdminHandlers(
  bot: Telegraf<MyContext>,
  listingService: ListingService,
  settingService: SettingService,
) {
  // ==========================================================
  // /setrules
  // ==========================================================

  bot.command("setrules", async (ctx) => {
    if (!isAuthorizedAdminUser(ctx)) {
      return ctx.reply(
        "⚠️ ဤ Command ကို အုပ်ထိန်းသူများသာ အသုံးပြုခွင့်ရှိပါသည်။",
      );
    }

    const commandText = ctx.message.text;
    const newRules = commandText.replace(/^\/setrules\s*/, "").trim();

    if (!newRules) {
      const currentRules = await settingService.getRules();

      return ctx.reply(
        `⚠️ စည်းကမ်းချက်အသစ် ထည့်သွင်းပေးပါ။\n\n` +
          `အသုံးပြုပုံ:\n` +
          `/setrules စည်းကမ်းချက်အသစ် စာသားများ...\n\n` +
          `လက်ရှိ စည်းကမ်းချက်များ:\n\n` +
          currentRules,
      );
    }

    try {
      await settingService.updateRules(newRules);

      await ctx.reply(
        "✅ စည်းကမ်းချက်များကို အောင်မြင်စွာ ပြောင်းလဲပြီးပါပြီ။",
      );
    } catch (error) {
      console.error("❌ Failed to update rules:", error);

      await ctx.reply(
        "❌ စည်းကမ်းချက်များ ပြောင်းလဲရာတွင် အမှားအယွင်း ရှိနေပါသည်။",
      );
    }
  });

  // ==========================================================
  // Start editing
  // ==========================================================

  bot.action(/^edit:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ ဤခလုတ်ကို အုပ်ထိန်းသူများသာ နှိပ်ခွင့်ရှိပါသည်။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const controlMessage = ctx.callbackQuery.message;

    const chatId = ctx.chat?.id;

    if (!controlMessage || chatId === undefined) {
      return;
    }

    try {
      const listing = await listingService.getListing(listingId);

      if (!listing) {
        await ctx.answerCbQuery("❌ Listing မတွေ့ပါ။", {
          show_alert: true,
        });

        return;
      }

      if (listing.status !== "PENDING") {
        await ctx.answerCbQuery(
          "❌ PENDING listing မဟုတ်တော့ပါ။ ပြင်ဆင်၍ မရပါ။",
          {
            show_alert: true,
          },
        );

        return;
      }

      getAdminSession(ctx).adminEdit = createEditDraft(
        listing,
        controlMessage.message_id,
      );

      await ctx.answerCbQuery("✏️ Edit mode ဖွင့်ပြီးပါပြီ။").catch(() => {});

      await ctx.telegram.editMessageText(
        chatId,
        controlMessage.message_id,
        undefined,
        buildEditMenuText(
          getAdminSession(ctx).adminEdit as AdminEditSessionData,
        ),
        {
          parse_mode: "HTML",
          ...editMenuKeyboard(listingId),
        },
      );
    } catch (error) {
      console.error("❌ Failed to start listing edit:", error);

      await ctx
        .answerCbQuery("❌ Edit mode ဖွင့်၍ မရပါ။", {
          show_alert: true,
        })
        .catch(() => {});
    }
  });

  // ==========================================================
  // Back to edit menu
  // ==========================================================

  bot.action(/^editback:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const draft = getAdminSession(ctx).adminEdit;

    const chatId = ctx.chat?.id;

    const message = ctx.callbackQuery.message;

    if (
      !draft ||
      draft.listingId !== listingId ||
      !message ||
      chatId === undefined
    ) {
      await ctx
        .answerCbQuery("❌ Edit session မတွေ့ပါ။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    draft.editingField = undefined;

    draft.promptMessageId = undefined;

    await ctx.answerCbQuery().catch(() => {});

    await ctx.telegram.editMessageText(
      chatId,
      message.message_id,
      undefined,
      buildEditMenuText(draft),
      {
        parse_mode: "HTML",
        ...editMenuKeyboard(listingId),
      },
    );
  });

  // ==========================================================
  // Text field selection
  // ==========================================================

  bot.action(
    /^editfield:(productName|condition|note|contact):(.+)$/,
    async (ctx) => {
      if (!isAuthorizedAdmin(ctx)) {
        await ctx
          .answerCbQuery("⚠️ Admin only.", {
            show_alert: true,
          })
          .catch(() => {});

        return;
      }

      const field = ctx.match[1] as AdminEditField;

      const listingId = ctx.match[2];

      const draft = ctx.session.adminEdit;

      if (!draft || draft.listingId !== listingId) {
        await ctx
          .answerCbQuery("❌ Edit session မတွေ့ပါ။", {
            show_alert: true,
          })
          .catch(() => {});

        return;
      }

      const prompts: Record<AdminEditField, string> = {
        productName: "📦 ပစ္စည်းအမည်အသစ်ကို ရေးပေးပါ။",

        priceAmount:
          "💰 ဈေးနှုန်းအသစ်ကို ရေးပေးပါ။\n\nဥပမာ: <code>250000</code>",

        condition: "📦 ပစ္စည်းအခြေအနေအသစ်ကို ရေးပေးပါ။",

        note: "📝 မှတ်ချက်အသစ်ကို ရေးပေးပါ။\n\nမှတ်ချက်မထားလိုပါက <code>-</code> ဟု ရေးပါ။",

        contact: "📞 ဆက်သွယ်ရန်အချက်အလက်အသစ်ကို ရေးပေးပါ။",
      };

      draft.editingField = field;

      draft.promptMessageId = undefined;

      await ctx.answerCbQuery().catch(() => {});

      const prompt = await ctx.reply(prompts[field], {
        parse_mode: "HTML",
        ...Markup.forceReply(),
        reply_parameters: {
          message_id: draft.controlMessageId,
        },
      });

      draft.promptMessageId = prompt.message_id;
    },
  );

  // ==========================================================
  // Price input
  // ==========================================================

  bot.action(/^editprice:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      await ctx
        .answerCbQuery("❌ Edit session မတွေ့ပါ။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    draft.editingField = "priceAmount";

    draft.promptMessageId = undefined;

    await ctx.answerCbQuery().catch(() => {});

    const prompt = await ctx.reply(
      `💰 ဈေးနှုန်းအသစ်ကို ရေးပေးပါ။\n\n` + `ဥပမာ: <code>250000</code>`,
      {
        parse_mode: "HTML",
        ...Markup.forceReply(),
        reply_parameters: {
          message_id: draft.controlMessageId,
        },
      },
    );

    draft.promptMessageId = prompt.message_id;
  });

  // ==========================================================
  // Category menu
  // ==========================================================

  bot.action(/^editcategory:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      await ctx
        .answerCbQuery("❌ Edit session မတွေ့ပါ။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    await ctx.answerCbQuery().catch(() => {});

    const chatId = ctx.chat?.id;

    const message = ctx.callbackQuery.message;

    if (chatId === undefined || !message) {
      return;
    }

    await ctx.telegram.editMessageText(
      chatId,
      message.message_id,
      undefined,
      `<b>🏷️ အမျိုးအစား ရွေးချယ်ပါ</b>`,
      {
        parse_mode: "HTML",
        ...categoryKeyboard(listingId),
      },
    );
  });

  // ==========================================================
  // Category selected
  // ==========================================================

  bot.action(
    /^editcat:(ELECTRONICS|CLOTHING|HOME|VEHICLE|OTHER):(.+)$/,
    async (ctx) => {
      if (!isAuthorizedAdmin(ctx)) {
        await ctx
          .answerCbQuery("⚠️ Admin only.", {
            show_alert: true,
          })
          .catch(() => {});

        return;
      }

      const category = ctx.match[1] as Category;

      const listingId = ctx.match[2];

      const draft = ctx.session.adminEdit;

      if (!draft || draft.listingId !== listingId) {
        return;
      }

      draft.category = category;

      await ctx.answerCbQuery(`✅ ${categoryLabels[category]}`).catch(() => {});

      const chatId = ctx.chat?.id;

      const message = ctx.callbackQuery.message;

      if (chatId === undefined || !message) {
        return;
      }

      await ctx.telegram.editMessageText(
        chatId,
        message.message_id,
        undefined,
        buildEditMenuText(draft),
        {
          parse_mode: "HTML",
          ...editMenuKeyboard(listingId),
        },
      );
    },
  );

  // ==========================================================
  // Location menu
  // ==========================================================

  bot.action(/^editlocation:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      return;
    }

    await ctx.answerCbQuery().catch(() => {});

    const chatId = ctx.chat?.id;

    const message = ctx.callbackQuery.message;

    if (chatId === undefined || !message) {
      return;
    }

    await ctx.telegram.editMessageText(
      chatId,
      message.message_id,
      undefined,
      `<b>📍 မြို့နယ် ရွေးချယ်ပါ</b>`,
      {
        parse_mode: "HTML",
        ...locationKeyboard(listingId),
      },
    );
  });

  // ==========================================================
  // Location selected
  // ==========================================================

  bot.action(/^editloc:(SHWE_KOKKO|MYAWADDY):(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const location = ctx.match[1] as Location;

    const listingId = ctx.match[2];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      return;
    }

    draft.location = location;

    await ctx.answerCbQuery(`✅ ${locationLabels[location]}`).catch(() => {});

    const chatId = ctx.chat?.id;

    const message = ctx.callbackQuery.message;

    if (chatId === undefined || !message) {
      return;
    }

    await ctx.telegram.editMessageText(
      chatId,
      message.message_id,
      undefined,
      buildEditMenuText(draft),
      {
        parse_mode: "HTML",
        ...editMenuKeyboard(listingId),
      },
    );
  });

  // ==========================================================
  // Currency menu
  // ==========================================================

  bot.action(/^editcurrency:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      return;
    }

    await ctx.answerCbQuery().catch(() => {});

    const chatId = ctx.chat?.id;

    const message = ctx.callbackQuery.message;

    if (chatId === undefined || !message) {
      return;
    }

    await ctx.telegram.editMessageText(
      chatId,
      message.message_id,
      undefined,
      `<b>💵 Currency ရွေးချယ်ပါ</b>`,
      {
        parse_mode: "HTML",
        ...currencyKeyboard(listingId),
      },
    );
  });

  // ==========================================================
  // Currency selected
  // ==========================================================

  bot.action(/^editcur:(MMK|THB):(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const currency = ctx.match[1] as Currency;

    const listingId = ctx.match[2];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      return;
    }

    draft.price.currency = currency;

    await ctx.answerCbQuery(`✅ ${currency}`).catch(() => {});

    const chatId = ctx.chat?.id;

    const message = ctx.callbackQuery.message;

    if (chatId === undefined || !message) {
      return;
    }

    await ctx.telegram.editMessageText(
      chatId,
      message.message_id,
      undefined,
      buildEditMenuText(draft),
      {
        parse_mode: "HTML",
        ...editMenuKeyboard(listingId),
      },
    );
  });

  // ==========================================================
  // Preview
  // ==========================================================

  bot.action(/^editpreview:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      await ctx
        .answerCbQuery("❌ Edit session မတွေ့ပါ။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listing = await listingService.getListing(listingId);

    if (!listing) {
      await ctx.answerCbQuery("❌ Listing မတွေ့ပါ။", {
        show_alert: true,
      });

      return;
    }

    const chatId = ctx.chat?.id;

    const message = ctx.callbackQuery.message;

    if (chatId === undefined || !message) {
      return;
    }

    await ctx.answerCbQuery().catch(() => {});

    await ctx.telegram.editMessageText(
      chatId,
      message.message_id,
      undefined,
      buildAdminPreview(listing, draft),
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("⬅️ Back to Edit", `editback:${listingId}`)],
        ]),
      },
    );
  });

  // ==========================================================
  // Save edits
  // ==========================================================

  bot.action(/^editsave:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      await ctx
        .answerCbQuery("❌ Edit session မတွေ့ပါ။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    await ctx.answerCbQuery("⏳ သိမ်းဆည်းနေပါသည်...").catch(() => {});

    try {
      const updated = await listingService.updatePendingListing(listingId, {
        productName: draft.productName,

        category: draft.category,

        location: draft.location,

        priceAmount: draft.price.priceAmount,

        currency: draft.price.currency,

        condition: draft.condition,

        note: draft.note,

        contact: draft.contact,
      });

      const chatId = ctx.chat?.id;

      const message = ctx.callbackQuery.message;

      if (chatId === undefined || !message) {
        getAdminSession(ctx).adminEdit = undefined;

        return;
      }

      getAdminSession(ctx).adminEdit = undefined;

      await ctx.telegram.editMessageText(
        chatId,
        message.message_id,
        undefined,
        buildSavedText(updated),
        {
          parse_mode: "HTML",
          ...pendingListingKeyboard(listingId),
        },
      );
    } catch (error) {
      console.error("❌ Failed to save listing edits:", error);

      await ctx
        .answerCbQuery(
          error instanceof Error
            ? `❌ ${error.message}`
            : "❌ ပြင်ဆင်ချက်များ သိမ်း၍ မရပါ။",
          {
            show_alert: true,
          },
        )
        .catch(() => {});
    }
  });

  // ==========================================================
  // Cancel edit
  // ==========================================================

  bot.action(/^editcancel:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ Admin only.", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    const listingId = ctx.match[1];

    const draft = ctx.session.adminEdit;

    if (!draft || draft.listingId !== listingId) {
      await ctx
        .answerCbQuery("❌ Edit session မတွေ့ပါ။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    getAdminSession(ctx).adminEdit = undefined;

    await ctx
      .answerCbQuery("❌ Edit ကို Cancel လုပ်ပြီးပါပြီ။")
      .catch(() => {});

    const chatId = ctx.chat?.id;

    const message = ctx.callbackQuery.message;

    if (chatId === undefined || !message) {
      return;
    }

    const listing = await listingService.getListing(listingId);

    if (!listing) {
      await ctx.telegram.editMessageText(
        chatId,
        message.message_id,
        undefined,
        "❌ Listing မတွေ့ပါ။",
      );

      return;
    }

    await ctx.telegram.editMessageText(
      chatId,
      message.message_id,
      undefined,
      buildSavedText(listing),
      {
        parse_mode: "HTML",
        ...pendingListingKeyboard(listingId),
      },
    );
  });

  // ==========================================================
  // Approve listing
  // ==========================================================

  bot.action(/^approve:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ ဤခလုတ်ကို အုပ်ထိန်းသူများသာ နှိပ်ခွင့်ရှိပါသည်။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    await ctx.answerCbQuery("⏳ အတည်ပြုနေပါသည်...").catch(() => {});

    const listingId = ctx.match[1];

    try {
      const result = await listingService.approveListing(listingId);

      const controlMessage = ctx.callbackQuery.message;

      if (!controlMessage) {
        return;
      }

      const chatId = ctx.chat?.id;

      if (chatId === undefined) {
        return;
      }

      try {
        await ctx.telegram.editMessageText(
          chatId,
          controlMessage.message_id,
          undefined,
          (result as { message: string }).message +
            `\n\n🟢 <b>Status: Available</b>`,
          {
            parse_mode: "HTML",
            ...availabilityKeyboard(listingId, true),
          },
        );
      } catch (error) {
        console.error("❌ Failed to update approve control message:", error);
      }
    } catch (error) {
      console.error("❌ Admin approve error:", error);

      await ctx
        .answerCbQuery(
          error instanceof Error ? `❌ ${error.message}` : "❌ အတည်ပြု၍ မရပါ။",
          {
            show_alert: true,
          },
        )
        .catch(() => {});
    }
  });

  // ==========================================================
  // Reject listing
  // ==========================================================

  bot.action(/^reject:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ ဤခလုတ်ကို အုပ်ထိန်းသူများသာ နှိပ်ခွင့်ရှိပါသည်။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    await ctx.answerCbQuery().catch(() => {});

    const listingId = ctx.match[1];

    const controlMessage = ctx.callbackQuery.message;

    if (!controlMessage) {
      return;
    }

    await ctx.reply(
      `❌ ပယ်ဖျက်မည် - ID: ${listingId}\n\n` +
        `ပယ်ဖျက်ရသည့် အကြောင်းပြချက်ကို ရေးပေးပါ -`,
      {
        ...Markup.forceReply(),

        reply_parameters: {
          message_id: controlMessage.message_id,
        },
      },
    );
  });

  // ==========================================================
  // Mark SOLD OUT
  // ==========================================================

  bot.action(/^soldout:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ ဤခလုတ်ကို အုပ်ထိန်းသူများသာ နှိပ်ခွင့်ရှိပါသည်။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    await ctx.answerCbQuery("⏳ Sold Out ပြောင်းနေပါသည်...").catch(() => {});

    const listingId = ctx.match[1];

    const controlMessage = ctx.callbackQuery.message;

    const chatId = ctx.chat?.id;

    if (!controlMessage || chatId === undefined) {
      return;
    }

    try {
      const result = await listingService.markAsSoldOut(listingId);

      await ctx.telegram.editMessageText(
        chatId,
        controlMessage.message_id,
        undefined,
        result.message + `\n\n🔴 <b>Status: Sold Out</b>`,
        {
          parse_mode: "HTML",

          ...availabilityKeyboard(listingId, false),
        },
      );
    } catch (error) {
      console.error("❌ Admin sold-out error:", error);

      await ctx
        .answerCbQuery(
          error instanceof Error
            ? `❌ ${error.message}`
            : "❌ Sold Out ပြောင်း၍ မရပါ။",
          {
            show_alert: true,
          },
        )
        .catch(() => {});
    }
  });

  // ==========================================================
  // Mark AVAILABLE
  // ==========================================================

  bot.action(/^available:(.+)$/, async (ctx) => {
    if (!isAuthorizedAdmin(ctx)) {
      await ctx
        .answerCbQuery("⚠️ ဤခလုတ်ကို အုပ်ထိန်းသူများသာ နှိပ်ခွင့်ရှိပါသည်။", {
          show_alert: true,
        })
        .catch(() => {});

      return;
    }

    await ctx.answerCbQuery("⏳ Available ပြောင်းနေပါသည်...").catch(() => {});

    const listingId = ctx.match[1];

    const controlMessage = ctx.callbackQuery.message;

    const chatId = ctx.chat?.id;

    if (!controlMessage || chatId === undefined) {
      return;
    }

    try {
      const result = await listingService.markAsAvailable(listingId);

      await ctx.telegram.editMessageText(
        chatId,
        controlMessage.message_id,
        undefined,
        result.message + `\n\n🟢 <b>Status: Available</b>`,
        {
          parse_mode: "HTML",

          ...availabilityKeyboard(listingId, true),
        },
      );
    } catch (error) {
      console.error("❌ Admin available error:", error);

      await ctx
        .answerCbQuery(
          error instanceof Error
            ? `❌ ${error.message}`
            : "❌ Available ပြောင်း၍ မရပါ။",
          {
            show_alert: true,
          },
        )
        .catch(() => {});
    }
  });

  // ==========================================================
  // Text messages
  //
  // Handles:
  // 1. Admin edit field input
  // 2. Rejection reason
  // ==========================================================

  bot.on("text", async (ctx, next) => {
    // ======================================================
    // ADMIN EDIT INPUT
    // ======================================================

    if (isAuthorizedAdmin(ctx)) {
      const edit = getAdminSession(ctx).adminEdit;

      /*
       * If we are waiting for a field value,
       * require the admin to reply to the exact
       * ForceReply prompt.
       */

      if (edit && edit.editingField && edit.promptMessageId !== undefined) {
        const replyTo =
          "reply_to_message" in ctx.message
            ? ctx.message.reply_to_message
            : undefined;

        if (replyTo?.message_id !== edit.promptMessageId) {
          /*
           * This is just another message.
           *
           * Do not accidentally treat it as an
           * edit value.
           */

          return next();
        }

        const value = ctx.message.text.trim();

        if (!value) {
          await ctx.reply("⚠️ အချက်အလက် မရှိပါ။ ထပ်မံရေးပေးပါ။");

          return;
        }

        // ==================================================
        // Product name
        // ==================================================

        if (edit.editingField === "productName") {
          edit.productName = value;
        }

        // ==================================================
        // Condition
        // ==================================================
        else if (edit.editingField === "condition") {
          edit.condition = value;
        }

        // ==================================================
        // Note
        // ==================================================
        else if (edit.editingField === "note") {
          edit.note = value === "-" ? null : value;
        }

        // ==================================================
        // Contact
        // ==================================================
        else if (edit.editingField === "contact") {
          edit.contact = value;
        }

        // ==================================================
        // Price
        // ==================================================
        else if (edit.editingField === "priceAmount") {
          const price = Number(value.replace(/,/g, ""));

          if (!Number.isFinite(price) || price <= 0) {
            await ctx.reply("⚠️ ဈေးနှုန်းမှားယွင်းနေပါသည်။\n\nဥပမာ: 250000");

            return;
          }

          edit.price.priceAmount = price;
        }

        edit.editingField = undefined;

        edit.promptMessageId = undefined;

        await ctx.reply(
          `✅ ပြင်ဆင်ချက်ကို Draft ထဲတွင် သိမ်းထားပါပြီ။\n\n` +
            `💾 Save နှိပ်မှသာ Database ထဲသို့ သိမ်းပါမည်။`,
          {
            reply_parameters: {
              message_id: edit.controlMessageId,
            },
          },
        );

        return;
      }
    }

    // ======================================================
    // REJECTION REASON
    // ======================================================

    if (!isAuthorizedAdmin(ctx) || !("reply_to_message" in ctx.message)) {
      return next();
    }

    const chatId = ctx.chat?.id;

    if (chatId === undefined) {
      return next();
    }

    const repliedMessage = ctx.message.reply_to_message;

    if (!repliedMessage) {
      return next();
    }

    const replyText = "text" in repliedMessage ? repliedMessage.text : "";

    const firstLine = replyText.split("\n")[0].trim();

    const match = firstLine.match(/^❌ ပယ်ဖျက်မည် - ID: (.+)$/);

    if (!match) {
      return next();
    }

    const listingId = match[1].trim();

    const reason = ctx.message.text.trim();

    if (!reason) {
      await ctx.reply("⚠️ အကြောင်းပြချက် မရှိပါ။");

      return;
    }

    try {
      const result = await listingService.rejectListing(listingId, reason);

      const rejectionPromptData = repliedMessage as unknown as {
        reply_to_message?: {
          message_id: number;
        };
      };

      const controlMessageId = rejectionPromptData.reply_to_message?.message_id;

      if (controlMessageId === undefined) {
        console.error("❌ Could not find control message ID for rejection.");

        await ctx.reply(result.message, {
          parse_mode: "HTML",
        });

        return;
      }

      try {
        await ctx.telegram.editMessageText(
          chatId,
          controlMessageId,
          undefined,
          result.message,
          {
            parse_mode: "HTML",
          },
        );
      } catch (error) {
        console.error("❌ Failed to update rejection control message:", error);

        await ctx.reply(result.message, {
          parse_mode: "HTML",
        });
      }
    } catch (error) {
      console.error("❌ Admin reject error:", error);

      await ctx.reply(
        error instanceof Error
          ? `❌ ${error.message}`
          : "❌ ပစ္စည်းပယ်ဖျက်ရာတွင် အမှားဖြစ်နေပါသည်။",
      );
    }
  });
}
