import { Markup, Scenes } from "telegraf";
import { MyContext, Category, Location, Currency } from "../types/listing";
import { escapeHtml } from "../utils/htmlEscape";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger";

interface WizardState {
  submissionKey?: string;
  productName?: string;
  category?: Category;
  location?: Location;
  price?: {
    priceAmount: number;
    currency: Currency;
  };
  condition?: string;
  note?: string | null;
  contact?: string;
  photoFileIds?: string[];
}

const getWizState = (ctx: MyContext): WizardState =>
  ctx.wizard.state as WizardState;

async function handleCommandText(
  ctx: MyContext,
  text: string,
): Promise<boolean> {
  if (!text.startsWith("/")) {
    return false;
  }

  if (text === "/cancel") {
    await ctx.reply("❌ ပစ္စည်းတင်ခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။");
    await ctx.scene.leave();
    return true;
  }

  await ctx.reply(
    "⚠️ လက်ရှိ ဖောင်ဖြည့်နေစဉ်အတွင်း Command များ အသုံးမပြုနိုင်ပါ။\n" +
      "ဖျက်သိမ်းလိုပါက /cancel ကို နှိပ်ပါ။",
  );
  return true;
}

// -------------------------------------------------------------
// Constants
// -------------------------------------------------------------
const MAX_PRODUCT_NAME_LENGTH = 80;
const MAX_CONDITION_LENGTH = 200;
const MAX_CONTACT_LENGTH = 80;
const MAX_PHOTOS = 6;
const MAX_NOTE_LENGTH = 500;

const CURRENCY_VALUES: Currency[] = ["MMK", "THB"];

// -------------------------------------------------------------
// Labels
// -------------------------------------------------------------

function getCategoryLabel(category?: Category): string {
  const labels: Record<Category, string> = {
    [Category.ELECTRONICS]: "📱 အီလက်ထရောနစ်",
    [Category.CLOTHING]: "👕 အဝတ်အထည်",
    [Category.HOME]: "🏠 အိမ်သုံးပစ္စည်း",
    [Category.VEHICLE]: "🚗 ယာဉ်မောင်းနှင်မှု",
    [Category.OTHER]: "📦 အခြား",
  };

  return category ? (labels[category] ?? category) : "မရှိပါ";
}

function getLocationLabel(location?: Location): string {
  const labels: Record<Location, string> = {
    [Location.SHWE_KOKKO]: "📍 ရွှေက္ကိုလ်",
    [Location.MYAWADDY]: "📍 မြဝတီ",
  };

  return location ? (labels[location] ?? location) : "မရှိပါ";
}

// -------------------------------------------------------------
// Validation helpers
// -------------------------------------------------------------

function getTextMessage(ctx: MyContext): string {
  if (!ctx.message || !("text" in ctx.message)) {
    return "";
  }

  return ctx.message.text.trim();
}

function parsePrice(text: string): {
  priceAmount: number;
  currency: Currency;
} | null {
  // 1. Remove all commas from input (e.g., "25,000 MMK" -> "25000 MMK")
  const sanitized = text.replace(/,/g, "").trim();
  const match = sanitized.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const currency = match[2].toUpperCase();

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !CURRENCY_VALUES.includes(currency as Currency)
  ) {
    return null;
  }

  return {
    priceAmount: amount,
    currency: currency as Currency,
  };
}

// -------------------------------------------------------------
// Keyboard helpers
// -------------------------------------------------------------

function categoryKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📱 အီလက်ထရောနစ်", Category.ELECTRONICS)],
    [Markup.button.callback("👕 အဝတ်အထည်", Category.CLOTHING)],
    [Markup.button.callback("🏠 အိမ်သုံးပစ္စည်း", Category.HOME)],
    [Markup.button.callback("🚗 ယာဉ်မောင်းနှင်မှု", Category.VEHICLE)],
    [Markup.button.callback("📦 အခြား", Category.OTHER)],
  ]);
}

function locationKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📍 ရွှေက္ကိုလ်", Location.SHWE_KOKKO)],
    [Markup.button.callback("📍 မြဝတီ", Location.MYAWADDY)],
  ]);
}

function reviewKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✏️ အမည်ပြင်မည်", "edit_product")],
    [
      Markup.button.callback("✏️ အမျိုးအစားပြင်မည်", "edit_category"),
      Markup.button.callback("✏️ နေရာပြင်မည်", "edit_location"),
    ],
    [
      Markup.button.callback("✏️ ဈေးနှုန်းပြင်မည်", "edit_price"),
      Markup.button.callback("✏️ အခြေအနေပြင်မည်", "edit_condition"),
    ],
    [
      Markup.button.callback("✏️ မှတ်ချက်ပြင်မည်", "edit_note"),
      Markup.button.callback("✏️ ဆက်သွယ်ရန်ပြင်မည်", "edit_contact"),
    ],
    [Markup.button.callback("📷 ဓာတ်ပုံပြင်မည်", "edit_photos")],
    [
      Markup.button.callback("✅ တင်မည်", "submit_listing"),
      Markup.button.callback("❌ ပယ်ဖျက်မည်", "cancel_listing"),
    ],
  ]);
}

// -------------------------------------------------------------
// Review
// -------------------------------------------------------------

function getReviewMessage(state: WizardState): string {
  const photoCount = state.photoFileIds?.length ?? 0;

  return (
    `📋 <b>ပစ္စည်းအချက်အလက်များကို စစ်ဆေးပါ</b>\n\n` +
    `📦 <b>ပစ္စည်းအမည်:</b> ` +
    `${escapeHtml(state.productName)}\n` +
    `🏷️ <b>အမျိုးအစား:</b> ` +
    `${escapeHtml(getCategoryLabel(state.category))}\n` +
    `📍 <b>နေရာ:</b> ` +
    `${escapeHtml(getLocationLabel(state.location))}\n` +
    `💰 <b>ဈေးနှုန်း:</b> ` +
    `${escapeHtml(state.price?.priceAmount)} ` +
    `${escapeHtml(state.price?.currency)}\n` +
    `📦 <b>အခြေအနေ:</b> ` +
    `${escapeHtml(state.condition)}\n` +
    `📝 <b>မှတ်ချက်:</b> ` +
    `${escapeHtml(state.note || "မရှိပါ")}\n` +
    `📞 <b>ဆက်သွယ်ရန်:</b> ` +
    `${escapeHtml(state.contact)}\n` +
    `📷 <b>ဓာတ်ပုံ:</b> ` +
    `${photoCount} ပုံ\n\n` +
    `အချက်အလက်များ မှန်ကန်ပါက <b>တင်မည်</b> ကို နှိပ်ပါ။\n` +
    `ပြင်ဆင်လိုပါက အောက်ပါခလုတ်များမှ ရွေးချယ်ပါ။`
  );
}

async function showReview(ctx: MyContext) {
  const state = getWizState(ctx);
  state.submissionKey ??= randomUUID();

  await ctx.reply(getReviewMessage(state), {
    parse_mode: "HTML",
    ...reviewKeyboard(),
  });
}

// -------------------------------------------------------------
// Photo handling
// -------------------------------------------------------------

async function addPhoto(ctx: MyContext): Promise<boolean> {
  if (!ctx.message || !("photo" in ctx.message)) {
    return false;
  }

  const state = getWizState(ctx);
  state.submissionKey ??= randomUUID();

  state.photoFileIds ??= [];

  if (state.photoFileIds.length >= MAX_PHOTOS) {
    await ctx.reply(`⚠️ ဓာတ်ပုံ ${MAX_PHOTOS} ပုံထက် ပို၍ မတင်နိုင်ပါ။`);

    return true;
  }

  const photos = ctx.message.photo;

  // Telegram provides multiple sizes.
  // The last one is normally the largest.
  const largestPhoto = photos[photos.length - 1];

  state.photoFileIds.push(largestPhoto.file_id);

  await ctx.reply(
    `✅ ဓာတ်ပုံ လက်ခံရရှိပါပြီ။ ` +
      `(${state.photoFileIds.length}/${MAX_PHOTOS})`,
  );

  return true;
}

// =============================================================
// SELL SCENE
// =============================================================

export const sellScene = new Scenes.WizardScene<MyContext>(
  "SELL_SCENE",

  // ===========================================================
  // STEP 0
  // Start
  // ===========================================================
  async (ctx) => {
    const state = getWizState(ctx);

    // New listing = new state.
    for (const key of Object.keys(state) as Array<keyof WizardState>) {
      delete state[key];
    }

    await ctx.reply("📦 ရောင်းချလိုသော ပစ္စည်း၏ အမည်ကို ရေးပြပေးပါ -");

    return ctx.wizard.next();
  },

  // ===========================================================
  // STEP 1
  // Product name
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);

    if (await handleCommandText(ctx, text)) {
      return;
    }

    if (!text) {
      return ctx.reply("⚠️ ပစ္စည်းအမည်ကို စာသားဖြင့် ရေးပေးပါ။");
    }

    if (text.length > MAX_PRODUCT_NAME_LENGTH) {
      return ctx.reply(
        `⚠️ ပစ္စည်းအမည်သည် စာလုံး ${MAX_PRODUCT_NAME_LENGTH} ထက် မပိုရပါ။`,
      );
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();

    state.productName = text;

    await ctx.reply(
      "📂 ပစ္စည်း၏ အမျိုးအစားကို ရွေးချယ်ပါ -",
      categoryKeyboard(),
    );

    return ctx.wizard.next();
  },

  // ===========================================================
  // STEP 2
  // Category
  // ===========================================================
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return ctx.reply("⚠️ ကျေးဇူးပြု၍ အမျိုးအစားတစ်ခုကို ရွေးချယ်ပါ။");
    }

    const category = ctx.callbackQuery.data as Category;

    if (!Object.values(Category).includes(category)) {
      return ctx.reply("⚠️ မမှန်ကန်သော အမျိုးအစား ဖြစ်ပါသည်။");
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();

    state.category = category;

    await ctx.answerCbQuery().catch(() => {});

    await ctx.reply(
      "📍 ပစ္စည်းရှိသော မြို့နယ်ကို ရွေးချယ်ပါ -",
      locationKeyboard(),
    );

    return ctx.wizard.next();
  },

  // ===========================================================
  // STEP 3
  // Location
  // ===========================================================
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return ctx.reply("⚠️ ကျေးဇူးပြု၍ မြို့နယ်တစ်ခုကို ရွေးချယ်ပါ။");
    }

    const location = ctx.callbackQuery.data as Location;

    if (!Object.values(Location).includes(location)) {
      return ctx.reply("⚠️ မမှန်ကန်သော မြို့နယ် ဖြစ်ပါသည်။");
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.location = location;

    await ctx.answerCbQuery().catch(() => {});

    await ctx.reply(
      "💰 ဈေးနှုန်းနှင့် ငွေကြေးအမျိုးအစားကို ရေးပေးပါ -\n\n" +
        "(ဥပမာ - 25000 MMK, 500 THB)",
    );

    return ctx.wizard.next();
  },

  // ===========================================================
  // STEP 4
  // Price
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);

    if (await handleCommandText(ctx, text)) {
      return;
    }

    const price = parsePrice(text);
    if (!price) {
      return ctx.reply(
        "⚠️ ဈေးနှုန်းနှင့် ငွေကြေးကို မှန်ကန်စွာ ရေးပေးပါ။\n" +
          "(ဥပမာ - 20000 MMK)\n\n" +
          "အသုံးပြုနိုင်သော ငွေကြေးများ: MMK, THB",
      );
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.price = price;

    await ctx.reply(
      "✨ ပစ္စည်း၏ လက်ရှိအခြေအနေကို ရေးပြပေးပါ -\n\n" +
        "(ဥပမာ - 90% သန့်၊ အစုတ်အပြဲမရှိ၊ ဘူးပါမည်)",
    );

    return ctx.wizard.next();
  },

  // ===========================================================
  // STEP 5
  // Condition
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);

    if (await handleCommandText(ctx, text)) {
      return;
    }
    if (!text) {
      return ctx.reply("⚠️ အခြေအနေကို စာသားဖြင့် ရေးပေးပါ။");
    }

    if (text.length > MAX_CONDITION_LENGTH) {
      return ctx.reply(
        `⚠️ အခြေအနေသည် စာလုံး ${MAX_CONDITION_LENGTH} ထက် မပိုရပါ။`,
      );
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.condition = text;

    await ctx.reply(
      "📝 ထပ်မံဖော်ပြလိုသော အချက်အလက်ရှိပါက ရေးပေးပါ။\n\n" +
        "ဥပမာ - မူရင်းဘူးပါသည်၊ ဈေးနှုန်းညှိနှိုင်းနိုင်ပါသည်။\n\n" +
        'မထည့်လိုပါက "ကျော်မည် ⏭️" ခလုတ်ကို နှိပ်ပါ။',
      Markup.inlineKeyboard([
        [Markup.button.callback("ကျော်မည် ⏭️", "skip_note")],
      ]),
    );

    return ctx.wizard.next();
  },

  // ===========================================================
  // STEP 6
  // Note
  // ===========================================================
  async (ctx) => {
    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();

    // Skip note
    if (
      ctx.callbackQuery &&
      "data" in ctx.callbackQuery &&
      ctx.callbackQuery.data === "skip_note"
    ) {
      await ctx.answerCbQuery().catch(() => {});

      state.note = null;

      await ctx.reply(
        "📞 ဝယ်ယူလိုသူများ ဆက်သွယ်ရန် ဖုန်းနံပါတ် သို့မဟုတ် Telegram Username ကို ရေးပေးပါ -",
      );

      return ctx.wizard.next();
    }

    const text = getTextMessage(ctx);
    if (await handleCommandText(ctx, text)) {
      return;
    }
    if (!text) {
      return ctx.reply(
        '⚠️ မှတ်ချက်ကို စာသားဖြင့် ရေးပေးပါ သို့မဟုတ် "ကျော်မည် ⏭️" ကို နှိပ်ပါ။',
      );
    }

    if (text.length > MAX_NOTE_LENGTH) {
      return ctx.reply(`⚠️ မှတ်ချက်သည် စာလုံး ${MAX_NOTE_LENGTH} ထက် မပိုရပါ။`);
    }

    state.note = text;

    await ctx.reply(
      "📞 ဝယ်ယူလိုသူများ ဆက်သွယ်ရန် ဖုန်းနံပါတ် သို့မဟုတ် Telegram Username ကို ရေးပေးပါ -",
    );

    return ctx.wizard.next();
  },

  // ===========================================================
  // STEP 7
  // Contact
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);
    if (await handleCommandText(ctx, text)) {
      return;
    }
    if (!text) {
      return ctx.reply("⚠️ ဆက်သွယ်ရန် အချက်အလက်ကို ရေးပေးပါ။");
    }

    if (text.length > MAX_CONTACT_LENGTH) {
      return ctx.reply(
        `⚠️ ဆက်သွယ်ရန်အချက်အလက်သည် စာလုံး ${MAX_CONTACT_LENGTH} ထက် မပိုရပါ။`,
      );
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();

    state.contact = text;
    state.photoFileIds = [];

    await ctx.reply(
      "📷 ပစ္စည်းဓာတ်ပုံ ပို့ပေးပါ။\n\n" +
        `အနည်းဆုံး ၁ ပုံ၊ အများဆုံး ${MAX_PHOTOS} ပုံ ပို့နိုင်ပါသည်။\n` +
        'ဓာတ်ပုံများ ပို့ပြီးပါက "ပြီးပြီ ✅" ခလုတ်ကို နှိပ်ပါ။',
      Markup.inlineKeyboard([
        [Markup.button.callback("ပြီးပြီ ✅", "photos_done")],
      ]),
    );

    return ctx.wizard.next();
  },

  // ===========================================================
  // STEP 8
  // Photos
  // ===========================================================
  async (ctx) => {
    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();

    // Done button
    if (
      ctx.callbackQuery &&
      "data" in ctx.callbackQuery &&
      ctx.callbackQuery.data === "photos_done"
    ) {
      await ctx.answerCbQuery().catch(() => {});

      if (!state.photoFileIds || state.photoFileIds.length === 0) {
        return ctx.reply("⚠️ အနည်းဆုံး ဓာတ်ပုံ ၁ ပုံ ပို့ပေးရန် လိုအပ်ပါသည်။");
      }

      await showReview(ctx);

      return ctx.wizard.next();
    }

    // Photo
    if (await addPhoto(ctx)) {
      return;
    }

    return ctx.reply(
      '⚠️ ဓာတ်ပုံ ပို့ပေးပါ သို့မဟုတ် "ပြီးပြီ ✅" ခလုတ်ကို နှိပ်ပါ။',
    );
  },

  // ===========================================================
  // STEP 9
  // Review
  // ===========================================================
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return ctx.reply("⚠️ အောက်ပါခလုတ်များထဲမှ တစ်ခုကို ရွေးချယ်ပေးပါ။");
    }

    const action = ctx.callbackQuery.data;

    await ctx.answerCbQuery().catch(() => {});

    // ---------------------------------------------------------
    // Submit
    // ---------------------------------------------------------
    if (action === "submit_listing") {
      const state = getWizState(ctx);
      state.submissionKey ??= randomUUID();

      if (
        !state.productName ||
        !state.category ||
        !state.location ||
        !state.price ||
        !state.condition ||
        !state.contact ||
        !state.photoFileIds?.length
      ) {
        return ctx.reply("⚠️ ပစ္စည်းအချက်အလက် မပြည့်စုံသေးပါ။");
      }

      try {
        await ctx.reply("⌛ သင့်ပစ္စည်းကို စိစစ်ရန် ပို့ပေးနေပါသည်...");

        await ctx.listingService.createListing({
          submissionKey: state.submissionKey!,

          sellerTelegramId: BigInt(ctx.from!.id),

          sellerUsername: ctx.from!.username || null,

          sellerFirstName: ctx.from!.first_name || null,

          productName: state.productName,

          category: state.category,

          location: state.location,

          priceAmount: state.price.priceAmount,

          currency: state.price.currency,

          condition: state.condition,

          note: state.note ?? null,

          contact: state.contact,

          photoFileIds: state.photoFileIds,
        });

        logger.info("✅ Listing created:");

        await ctx.reply(
          "✅ သင့်ပစ္စည်းကို အောင်မြင်စွာ တင်ပြီးပါပြီ။\n\n" +
            "Admin များ စိစစ်ပြီးပါက Channel တွင် ဖော်ပြပေးပါမည်။",
        );

        return ctx.scene.leave();
      } catch (error) {
        logger.error({ err: error }, "❌ Failed to create listing:");

        return ctx.reply(
          "⚠️ စနစ်ပိုင်းဆိုင်ရာ အမှားအယွင်း ဖြစ်ပေါ်နေပါသည်။\n" +
            "ကျေးဇူးပြု၍ နောက်ထပ်ကြိုးစားပါ။",
        );
      }
    }

    // ---------------------------------------------------------
    // Cancel
    // ---------------------------------------------------------
    if (action === "cancel_listing") {
      await ctx.reply("❌ ပစ္စည်းတင်ခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။");

      return ctx.scene.leave();
    }

    // ---------------------------------------------------------
    // Edit product
    // ---------------------------------------------------------
    if (action === "edit_product") {
      await ctx.reply("📦 ပစ္စည်းအမည်အသစ်ကို ရေးပေးပါ -");

      return ctx.wizard.selectStep(10);
    }

    // ---------------------------------------------------------
    // Edit category
    // ---------------------------------------------------------
    if (action === "edit_category") {
      await ctx.reply(
        "📂 ပစ္စည်း၏ အမျိုးအစားအသစ်ကို ရွေးချယ်ပါ -",
        categoryKeyboard(),
      );

      return ctx.wizard.selectStep(11);
    }

    // ---------------------------------------------------------
    // Edit location
    // ---------------------------------------------------------
    if (action === "edit_location") {
      await ctx.reply(
        "📍 ပစ္စည်းရှိသော မြို့နယ်အသစ်ကို ရွေးချယ်ပါ -",
        locationKeyboard(),
      );

      return ctx.wizard.selectStep(12);
    }

    // ---------------------------------------------------------
    // Edit price
    // ---------------------------------------------------------
    if (action === "edit_price") {
      await ctx.reply(
        "💰 ဈေးနှုန်းနှင့် ငွေကြေးအမျိုးအစားအသစ်ကို ရေးပေးပါ -\n\n" +
          "(ဥပမာ - 25000 MMK, 500 THB)",
      );

      return ctx.wizard.selectStep(13);
    }

    // ---------------------------------------------------------
    // Edit condition
    // ---------------------------------------------------------
    if (action === "edit_condition") {
      await ctx.reply("✨ ပစ္စည်း၏ လက်ရှိအခြေအနေအသစ်ကို ရေးပေးပါ -");

      return ctx.wizard.selectStep(14);
    }

    // ---------------------------------------------------------
    // Edit note
    // ---------------------------------------------------------
    if (action === "edit_note") {
      await ctx.reply(
        "📝 မှတ်ချက်အသစ်ကို ရေးပေးပါ။\n\n" +
          'မှတ်ချက်မထည့်လိုပါက "မရှိပါ" ဟု ရေးပါ။',
      );

      return ctx.wizard.selectStep(15);
    }

    // ---------------------------------------------------------
    // Edit contact
    // ---------------------------------------------------------
    if (action === "edit_contact") {
      await ctx.reply(
        "📞 ဖုန်းနံပါတ် သို့မဟုတ် Telegram Username အသစ်ကို ရေးပေးပါ -",
      );

      return ctx.wizard.selectStep(16);
    }

    // ---------------------------------------------------------
    // Edit photos
    // ---------------------------------------------------------
    if (action === "edit_photos") {
      const state = getWizState(ctx);
      state.submissionKey ??= randomUUID();

      state.photoFileIds = [];

      await ctx.reply(
        "📷 ဓာတ်ပုံအသစ်များ ပို့ပေးပါ။\n\n" +
          `အနည်းဆုံး ၁ ပုံ၊ အများဆုံး ${MAX_PHOTOS} ပုံ ပို့နိုင်ပါသည်။\n` +
          'ဓာတ်ပုံများ ပို့ပြီးပါက "ဓာတ်ပုံပြီးပြီ ✅" ကို နှိပ်ပါ။',
        Markup.inlineKeyboard([
          [Markup.button.callback("ဓာတ်ပုံပြီးပြီ ✅", "edit_photos_done")],
        ]),
      );

      return ctx.wizard.selectStep(17);
    }

    return ctx.reply("⚠️ မမှန်ကန်သော ရွေးချယ်မှု ဖြစ်ပါသည်။");
  },

  // ===========================================================
  // STEP 10
  // Edit product
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);
    if (await handleCommandText(ctx, text)) {
      return;
    }
    if (!text) {
      return ctx.reply("⚠️ ပစ္စည်းအမည်ကို စာသားဖြင့် ရေးပေးပါ။");
    }

    if (text.length > MAX_PRODUCT_NAME_LENGTH) {
      return ctx.reply(
        `⚠️ ပစ္စည်းအမည်သည် စာလုံး ${MAX_PRODUCT_NAME_LENGTH} ထက် မပိုရပါ။`,
      );
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.productName = text;

    await showReview(ctx);

    return ctx.wizard.selectStep(9);
  },

  // ===========================================================
  // STEP 11
  // Edit category
  // ===========================================================
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return ctx.reply("⚠️ ကျေးဇူးပြု၍ အမျိုးအစားတစ်ခုကို ရွေးချယ်ပါ။");
    }

    const category = ctx.callbackQuery.data as Category;

    if (!Object.values(Category).includes(category)) {
      return ctx.reply("⚠️ မမှန်ကန်သော အမျိုးအစား ဖြစ်ပါသည်။");
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.category = category;

    await ctx.answerCbQuery().catch(() => {});

    await showReview(ctx);

    return ctx.wizard.selectStep(9);
  },

  // ===========================================================
  // STEP 12
  // Edit location
  // ===========================================================
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) {
      return ctx.reply("⚠️ ကျေးဇူးပြု၍ မြို့နယ်တစ်ခုကို ရွေးချယ်ပါ။");
    }

    const location = ctx.callbackQuery.data as Location;

    if (!Object.values(Location).includes(location)) {
      return ctx.reply("⚠️ မမှန်ကန်သော မြို့နယ် ဖြစ်ပါသည်။");
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.location = location;

    await ctx.answerCbQuery().catch(() => {});

    await showReview(ctx);

    return ctx.wizard.selectStep(9);
  },

  // ===========================================================
  // STEP 13
  // Edit price
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);
    if (await handleCommandText(ctx, text)) {
      return;
    }
    const price = parsePrice(text);

    if (!price) {
      return ctx.reply(
        "⚠️ ဈေးနှုန်းနှင့် ငွေကြေးကို မှန်ကန်စွာ ရေးပေးပါ။\n" +
          "(ဥပမာ - 20000 MMK)\n\n" +
          "အသုံးပြုနိုင်သော ငွေကြေးများ: MMK, THB",
      );
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.price = price;

    await showReview(ctx);

    return ctx.wizard.selectStep(9);
  },

  // ===========================================================
  // STEP 14
  // Edit condition
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);
    if (await handleCommandText(ctx, text)) {
      return;
    }
    if (!text) {
      return ctx.reply("⚠️ အခြေအနေကို စာသားဖြင့် ရေးပေးပါ။");
    }

    if (text.length > MAX_CONDITION_LENGTH) {
      return ctx.reply(
        `⚠️ အခြေအနေသည် စာလုံး ${MAX_CONDITION_LENGTH} ထက် မပိုရပါ။`,
      );
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.condition = text;

    await showReview(ctx);

    return ctx.wizard.selectStep(9);
  },

  // ===========================================================
  // STEP 15
  // Edit note
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);
    if (await handleCommandText(ctx, text)) {
      return;
    }
    if (!text) {
      return ctx.reply("⚠️ မှတ်ချက်ကို စာသားဖြင့် ရေးပေးပါ။");
    }

    if (text.length > MAX_NOTE_LENGTH) {
      return ctx.reply(`⚠️ မှတ်ချက်သည် စာလုံး ${MAX_NOTE_LENGTH} ထက် မပိုရပါ။`);
    }

    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();

    state.note = text === "မရှိပါ" ? null : text;

    await showReview(ctx);

    return ctx.wizard.selectStep(9);
  },

  // ===========================================================
  // STEP 16
  // Edit contact
  // ===========================================================
  async (ctx) => {
    const text = getTextMessage(ctx);
    if (await handleCommandText(ctx, text)) {
      return;
    }
    if (!text) {
      return ctx.reply("⚠️ ဆက်သွယ်ရန် အချက်အလက်ကို ရေးပေးပါ။");
    }

    if (text.length > MAX_CONTACT_LENGTH) {
      return ctx.reply(
        `⚠️ ဆက်သွယ်ရန်အချက်အလက်သည် စာလုံး ${MAX_CONTACT_LENGTH} ထက် မပိုရပါ။`,
      );
    }
    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();
    state.contact = text;

    await showReview(ctx);

    return ctx.wizard.selectStep(9);
  },

  // ===========================================================
  // STEP 17
  // Edit photos
  // ===========================================================
  async (ctx) => {
    const state = getWizState(ctx);
    state.submissionKey ??= randomUUID();

    // Done
    if (
      ctx.callbackQuery &&
      "data" in ctx.callbackQuery &&
      ctx.callbackQuery.data === "edit_photos_done"
    ) {
      await ctx.answerCbQuery().catch(() => {});

      if (!state.photoFileIds || state.photoFileIds.length === 0) {
        return ctx.reply("⚠️ အနည်းဆုံး ဓာတ်ပုံ ၁ ပုံ ပို့ပေးရန် လိုအပ်ပါသည်။");
      }

      await showReview(ctx);

      return ctx.wizard.selectStep(9);
    }

    // Photo
    if (await addPhoto(ctx)) {
      return;
    }

    return ctx.reply(
      '⚠️ ဓာတ်ပုံ ပို့ပေးပါ သို့မဟုတ် "ဓာတ်ပုံပြီးပြီ ✅" ကို နှိပ်ပါ။',
    );
  },
);
