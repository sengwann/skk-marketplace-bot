import cron from "node-cron";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { TelegramService } from "./telegram.service";
import { ListingRepository } from "../db/listing.repository";

export function startAdminGroupRetry(telegramService: TelegramService) {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const stuck = await prisma.listing.findMany({
        where: {
          status: "PENDING",
          adminGroupSentAt: null,
          createdAt: { lt: new Date(Date.now() - 60_000) },
        },
        take: 20,
      });

      for (const row of stuck) {
        try {
          const listing = await ListingRepository.findById(row.id);
          if (!listing) continue;

          const msg = await telegramService.sendToAdminGroup(listing);
          await ListingRepository.markAdminGroupSent(
            listing.id,
            BigInt(msg.message_id),
          );

          logger.info(
            { listingId: listing.id },
            "✅ Resent listing to admin group",
          );
        } catch (err) {
          logger.error(
            { err, listingId: row.id },
            "❌ Failed to resend listing to admin group",
          );
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Admin group retry job failed");
    }
  });

  logger.info("Admin group retry cron registered (every 5 minutes)");
}
