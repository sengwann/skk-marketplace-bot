import { z } from "zod";

export const listingInputSchema = z.object({
  sellerTelegramId: z.number().int().positive(),

  sellerUsername: z.string().max(64).nullable().optional(),

  sellerFirstName: z.string().max(128).nullable().optional(),

  productName: z.string().trim().min(1).max(120),

  category: z.enum(["ELECTRONICS", "CLOTHING", "HOME", "VEHICLE", "OTHER"]),

  location: z.enum(["SHWE_KOKKO", "MYAWADDY"]),

  priceAmount: z.number().finite().positive().max(1_000_000_000_000),

  currency: z.enum(["MMK", "THB"]),

  condition: z.string().trim().min(1).max(300),

  note: z.string().trim().max(500).nullable().optional(),

  contact: z.string().trim().min(1).max(100),

  photoFileIds: z.array(z.string().min(1).max(256)).min(1).max(6),
});
