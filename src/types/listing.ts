
import { Context, Scenes } from 'telegraf';
import { ListingService } from '../services/listing.service';
import { SettingService } from '../services/setting.service';

// ============================================================
// Enums
// ============================================================

export enum ListingStatus {
  PENDING = 'PENDING',
  APPROVING = 'APPROVING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ListingAvailability {
  AVAILABLE = 'AVAILABLE',
  SOLD_OUT = 'SOLD_OUT',
}

export enum Category {
  ELECTRONICS = 'ELECTRONICS',
  CLOTHING = 'CLOTHING',
  HOME = 'HOME',
  VEHICLE = 'VEHICLE',
  OTHER = 'OTHER',
}

export enum Location {
  SHWE_KOKKO = 'SHWE_KOKKO',
  MYAWADDY = 'MYAWADDY',
}

// ============================================================
// Value types
// ============================================================

export type Currency = 'MMK' | 'THB';

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
// Admin edit session
// ============================================================

export type AdminEditField =
  | 'productName'
  | 'priceAmount'
  | 'condition'
  | 'note'
  | 'contact';

export interface AdminEditSessionData {
  listingId: string;

  // Original admin control message.
  controlMessageId: number;

  // Currently selected field waiting for text input.
  editingField?: AdminEditField;

  // The exact Telegram prompt message that the admin
  // must reply to.
  promptMessageId?: number;

  // Draft values.
  //
  // These values are NOT saved to PostgreSQL until
  // the admin presses "💾 Save".
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

export interface WizardSessionData
  extends Scenes.WizardSessionData {
  productName?: string;
  category?: Category;
  location?: Location;
  price?: Price;
  condition?: string;
  note?: string | null;
  contact?: string;
  photoFileIds?: string[];

  // Admin editing state.
  adminEdit?: AdminEditSessionData;
}

// ============================================================
// Telegram context
// ============================================================

export interface MyContext extends Context {
  scene: Scenes.SceneContextScene<
    MyContext,
    WizardSessionData
  >;

  session: Scenes.WizardSession<WizardSessionData>;

  wizard: Scenes.WizardContextWizard<MyContext>;

  listingService: ListingService;

  settingService: SettingService;
}

