import { z } from "zod";
import { Category, Location } from "../types/listing";

export const listingInputSchema = z.object({
  submissionKey: z.string().min(1).max(64),

  sellerTelegramId: z.bigint().positive(),

  sellerUsername: z.string().max(64).nullable().optional(),

  sellerFirstName: z.string().max(128).nullable().optional(),

  productName: z.string().trim().min(1).max(120),

  category: z.nativeEnum(Category),

  location: z.nativeEnum(Location),

  priceAmount: z.number().finite().positive().max(1_000_000_000_000),

  currency: z.enum(["MMK", "THB"]),

  condition: z.string().trim().min(1).max(300),

  note: z.string().trim().max(500).nullable().optional(),

  contact: z.string().trim().min(1).max(100),

  photoFileIds: z.array(z.string().min(1).max(256)).min(1).max(6),
});

export function validateListingInput(data: unknown) {
  return listingInputSchema.safeParse(data);
}
