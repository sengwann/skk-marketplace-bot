import { Markup, Telegraf } from "telegraf";
import { Listing, MyContext } from "../types/listing";
import { config } from "../config";
import { escapeHtml } from "../utils/htmlEscape";
import { formatListingMessage } from "../utils/formatListing";
import { logger } from "@/utils/logger";

export interface AdminListingPayload extends Listing {}

export class TelegramService {
  constructor(private bot: Telegraf<MyContext>) {}

  async sendToAdminGroup(listing: AdminListingPayload) {
    const caption = this.buildAdminCaption(listing);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("✏️ ပြင်ဆင်မည်", `edit:${listing.id}`)],
      [
        Markup.button.callback("✅ အတည်ပြုမည်", `approve:${listing.id}`),

        Markup.button.callback("❌ ငြင်းပယ်မည်", `reject:${listing.id}`),
      ],
    ]);

    if (listing.photoFileIds.length === 0) {
      return this.bot.telegram.sendMessage(config.adminChatId, caption, {
        parse_mode: "HTML",
        ...keyboard,
      });
    }

    const media = listing.photoFileIds.map((fileId, index) => ({
      type: "photo" as const,
      media: fileId,
      ...(index === 0
        ? {
            caption,
            parse_mode: "HTML" as const,
          }
        : {}),
    }));

    const messages = await this.bot.telegram.sendMediaGroup(
      config.adminChatId,
      media,
    );

    const controlMessage = await this.bot.telegram.sendMessage(
      config.adminChatId,
      `📌 <b>ပစ္စည်းကို စီမံရန်</b>\n` +
        `Listing ID: <code>${escapeHtml(listing.publicId)}</code>`,
      {
        parse_mode: "HTML",
        ...keyboard,
        reply_parameters: {
          message_id: messages[0].message_id,
        },
      },
    );

    return controlMessage;
  }

  async publishToChannel(listing: Listing) {
    const caption = formatListingMessage(listing);

    if (listing.photoFileIds.length === 0) {
      return this.bot.telegram.sendMessage(config.channelId, caption, {
        parse_mode: "HTML",
      });
    }

    const media = listing.photoFileIds.map((fileId, index) => ({
      type: "photo" as const,
      media: fileId,
      ...(index === 0
        ? {
            caption,
            parse_mode: "HTML" as const,
          }
        : {}),
    }));

    const messages = await this.bot.telegram.sendMediaGroup(
      config.channelId,
      media,
    );

    return messages[0];
  }

  async updateChannelListing(listing: Listing): Promise<void> {
    if (listing.channelMessageId === null) {
      return;
    }

    const caption = formatListingMessage(listing);

    try {
      if (listing.photoFileIds.length > 0) {
        await this.bot.telegram.editMessageCaption(
          config.channelId,
          Number(listing.channelMessageId),
          undefined,
          caption,
          {
            parse_mode: "HTML",
          },
        );

        return;
      }

      await this.bot.telegram.editMessageText(
        config.channelId,
        Number(listing.channelMessageId),
        undefined,
        caption,
        {
          parse_mode: "HTML",
        },
      );
    } catch (error) {
      logger.error({ err: error }, "❌ Failed to update channel listing:");

      throw error;
    }
  }

  /**
   * Notify seller that their listing
   * has been approved and published.
   */
  async notifySellerApproved(listing: Listing): Promise<void> {
    const message =
      `✅ <b>သင့်ပစ္စည်းကို အတည်ပြုပြီးပါပြီ</b>\n\n` +
      `📦 <b>ပစ္စည်းအမည်:</b> ${escapeHtml(listing.productName)}\n` +
      `💰 <b>ဈေးနှုန်း:</b> ${escapeHtml(listing.priceAmount)} ${escapeHtml(listing.currency)}\n\n` +
      `📢 သင့်ပစ္စည်းကို Channel တွင် ဖော်ပြပြီးပါပြီ။`;

    await this.bot.telegram.sendMessage(
      listing.sellerTelegramId.toString(),
      message,
      {
        parse_mode: "HTML",
      },
    );
  }

  /**
   * Notify seller that their listing
   * has been rejected by an admin.
   */
  async notifySellerRejected(listing: Listing, reason: string): Promise<void> {
    const cleanReason = reason.trim();

    const message =
      `❌ <b>သင့်ပစ္စည်းကို ပယ်ဖျက်လိုက်ပါသည်</b>\n\n` +
      `📦 <b>ပစ္စည်းအမည်:</b> ${escapeHtml(listing.productName)}\n` +
      `💰 <b>ဈေးနှုန်း:</b> ${escapeHtml(listing.priceAmount)} ${escapeHtml(listing.currency)}\n\n` +
      `📝 <b>အကြောင်းပြချက်:</b>\n` +
      `${escapeHtml(cleanReason)}`;

    await this.bot.telegram.sendMessage(
      listing.sellerTelegramId.toString(),
      message,
      {
        parse_mode: "HTML",
      },
    );
  }

  private buildAdminCaption(listing: Listing): string {
    const noteSection = listing.note
      ? `\n📝 <b>မှတ်ချက်:</b> ${escapeHtml(listing.note)}\n`
      : "";

    const seller = listing.sellerUsername
      ? `@${escapeHtml(listing.sellerUsername)}`
      : "မရှိပါ";

    return (
      `<b>📌 ရောင်းရန် ပစ္စည်းအသစ် ရောက်ရှိလာပါသည်</b>\n` +
      `🧾 <b>Listing ID:</b> <code>${escapeHtml(listing.publicId)}</code>\n` +
      `📦 <b>ပစ္စည်းအမည်:</b> ${escapeHtml(listing.productName)}\n` +
      `🏷️ <b>အမျိုးအစား:</b> ${escapeHtml(listing.category)}\n` +
      `📍 <b>မြို့နယ်:</b> ${escapeHtml(listing.location)}\n` +
      `💰 <b>ဈေးနှုန်း:</b> ${escapeHtml(listing.priceAmount)} ${escapeHtml(listing.currency)}\n` +
      `📦 <b>အခြေအနေ:</b> ${escapeHtml(listing.condition)}\n` +
      noteSection +
      `📞 <b>ဆက်သွယ်ရန်:</b> ${escapeHtml(listing.contact)}\n` +
      `👤 <b>ရောင်းသူ:</b> ${seller}\n` +
      `(Seller ID: <code>${escapeHtml(listing.sellerTelegramId)}</code>)`
    );
  }
}
