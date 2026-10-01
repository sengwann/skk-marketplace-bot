import {
  Listing,
  Category,
  Location,
  ListingAvailability,
} from "../types/listing";
import { escapeHtml } from "./htmlEscape";

// ============================================================
// Labels
// ============================================================

const categoryNames: Record<Category, string> = {
  [Category.ELECTRONICS]: "Electronic",
  [Category.CLOTHING]: "Fashion",
  [Category.HOME]: "Home",
  [Category.VEHICLE]: "Vehicle",
  [Category.OTHER]: "Other",
};

const locationNames: Record<Location, string> = {
  [Location.SHWE_KOKKO]: "ShweKok Ko",
  [Location.MYAWADDY]: "Myawaddy",
};

// ============================================================
// Hashtag
// ============================================================

function toHashtag(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_A-Z]/g, "");
}

// ============================================================
// Label helpers
// ============================================================

export function getCategoryLabel(category: Category): string {
  return categoryNames[category] ?? category;
}

export function getLocationLabel(location: Location): string {
  return locationNames[location] ?? location;
}

// ============================================================
// Channel message
// ============================================================

export function formatListingMessage(listing: Listing): string {
  const categoryLabel = getCategoryLabel(listing.category);

  const locationLabel = getLocationLabel(listing.location);

  const categoryHashtag = toHashtag(categoryLabel);

  const locationHashtag = toHashtag(locationLabel);

  const availability =
    listing.availability === ListingAvailability.SOLD_OUT
      ? "🔴 <b>Sold Out</b>"
      : "🟢 <b>Available</b>";

  const noteSection = listing.note
    ? `\n📝 <b>မှတ်ချက်:</b> ${escapeHtml(listing.note)}\n`
    : "";

  return (
    `<b>📌 ${escapeHtml(listing.productName)}</b>\n` +
    `🧾 <b>ID:</b> <code>${escapeHtml(listing.publicId)}</code>\n` +
    `💰 <b>ဈေးနှုန်း:</b> ` +
    `${escapeHtml(listing.priceAmount)} ` +
    `${escapeHtml(listing.currency)}\n` +
    `📦 <b>အခြေအနေ:</b> ` +
    `${escapeHtml(listing.condition)}\n` +
    `📍 <b>နေရာ:</b> ` +
    `${escapeHtml(locationLabel)}\n` +
    noteSection +
    `📞 <b>ဆက်သွယ်ရန်:</b> ` +
    `${escapeHtml(listing.contact)}\n` +
    `🏷️ #${categoryHashtag} #${locationHashtag}\n` +
    availability
  );
}
