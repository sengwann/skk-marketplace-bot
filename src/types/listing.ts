import { Context, Scenes } from "telegraf";
import { ListingService } from "../services/listing.service";
import { SettingService } from "../services/setting.service";

// ============================================================
// Enums
// ============================================================

export enum ListingStatus {
  PENDING = "PENDING",
  APPROVING = "APPROVING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum ListingAvailability {
  AVAILABLE = "AVAILABLE",
  SOLD_OUT = "SOLD_OUT",
}

export enum Category {
  ELECTRONICS = "ELECTRONICS",
  CLOTHING = "CLOTHING",
  HOME = "HOME",
  VEHICLE = "VEHICLE",
  OTHER = "OTHER",
}

export enum Location {
  SHWE_KOKKO = "SHWE_KOKKO",
  MYAWADDY = "MYAWADDY",
}

// ============================================================
// Value types
// ============================================================

export type Currency = "MMK" | "THB";

export interface Price {
  priceAmount: number;
  currency: Currency;
}

// ============================================================
// Listing entity
// ============================================================

export interface Listing {
  id: string;

  sellerTelegramId: number;
  sellerUsername: string | null;
  sellerFirstName: string | null;

  productName: string;
  category: Category;
  location: Location;

  priceAmount: number;
  currency: Currency;

  condition: string;
  note: string | null;
  contact: string;

  photoFileIds: string[];

  status: ListingStatus;
  availability: ListingAvailability;

  rejectionReason: string | null;
  channelMessageId: number | null;

  createdAt: Date;
}

// ============================================================
// Admin edit field
// ============================================================

export type AdminEditField =
  | "productName"
  | "priceAmount"
  | "condition"
  | "note"
  | "contact";

// ============================================================
// Admin edit session
// ============================================================

export interface AdminEditSessionData {
  listingId: string;

  // Original admin control message.
  controlMessageId: number;

  // Field currently waiting for text input.
  editingField?: AdminEditField;

  // ForceReply prompt message ID.
  promptMessageId?: number;

  // ----------------------------------------------------------
  // Draft values
  //
  // These are NOT written to PostgreSQL until Save is pressed.
  // ----------------------------------------------------------

  productName: string;

  category: Category;

  location: Location;

  price: Price;

  condition: string;

  note: string | null;

  contact: string;
}

// ============================================================
// Wizard session
// ============================================================

export interface WizardSessionData extends Scenes.WizardSessionData {
  productName?: string;

  category?: Category;

  submissionKey?: string;

  location?: Location;

  price?: Price;

  condition?: string;

  note?: string | null;

  contact?: string;

  photoFileIds?: string[];
}

// ============================================================
// Admin session type
//
// Telegraf's WizardSession generic does not expose our custom
// adminEdit property correctly in this project.
//
// So we explicitly add adminEdit to the session type here.
// ============================================================

export type MyWizardSession = Scenes.WizardSession<WizardSessionData> & {
  adminEdit?: AdminEditSessionData;
};

// ============================================================
// Telegram context
// ============================================================

export interface MyContext extends Context {
  scene: Scenes.SceneContextScene<MyContext, WizardSessionData>;

  session: MyWizardSession;

  wizard: Scenes.WizardContextWizard<MyContext>;

  listingService: ListingService;

  settingService: SettingService;
}
