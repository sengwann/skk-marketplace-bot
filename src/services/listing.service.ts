import {
  ListingAvailability,
  ListingStatus,
  CreateListingInput,
} from "../types/listing";
import { logger } from "../utils/logger";
import {
  ListingRepository,
  UpdatePendingListingInput,
} from "../db/listing.repository";
import { escapeHtml } from "../utils/htmlEscape";

import { TelegramService } from "./telegram.service";
import { listingInputSchema } from "../validators/listing.validator";

// ============================================================
// Listing service
// ============================================================

export class ListingService {
  constructor(private telegramService: TelegramService) {}

  private normalizePublicId(raw: string): string {
    return raw.trim().toUpperCase().replace(/^#/, "").replace(/-/g, "");
  }

  async getListingByPublicId(rawPublicId: string) {
    const publicId = this.normalizePublicId(rawPublicId);

    if (!publicId) {
      throw new Error("Listing ID is required.");
    }

    const listing = await ListingRepository.findByPublicId(publicId);

    if (!listing) {
      throw new Error("Listing ID not found.");
    }

    return listing;
  }

  async markAsSoldOutByPublicId(rawPublicId: string) {
    const listing = await this.getListingByPublicId(rawPublicId);

    if (listing.status !== ListingStatus.APPROVED) {
      throw new Error("Only approved listings can be marked as sold out.");
    }

    return this.markAsSoldOut(listing.id);
  }

  async markAsAvailableByPublicId(rawPublicId: string) {
    const listing = await this.getListingByPublicId(rawPublicId);

    if (listing.status !== ListingStatus.APPROVED) {
      throw new Error("Only approved listings can be marked as available.");
    }

    return this.markAsAvailable(listing.id);
  }
  // ==========================================================
  // Get listing
  // ==========================================================

  async getListing(id: string) {
    return ListingRepository.findById(id);
  }

  // ==========================================================
  // Update pending listing
  // ==========================================================

  async updatePendingListing(id: string, data: UpdatePendingListingInput) {
    const listing = await ListingRepository.findById(id);

    if (!listing) {
      throw new Error("Listing not found.");
    }

    if (listing.status !== ListingStatus.PENDING) {
      throw new Error("Only pending listings can be edited.");
    }

    return ListingRepository.updatePendingListing(id, data);
  }

  // ==========================================================
  // Create listing
  // ==========================================================

  async createListing(data: CreateListingInput) {
    const parsed = listingInputSchema.safeParse(data);

    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "❌ Invalid listing input");

      throw new Error("Invalid listing input.");
    }
    const repositoryData: CreateListingInput = {
      submissionKey: parsed.data.submissionKey,
      sellerTelegramId: parsed.data.sellerTelegramId,
      sellerUsername: parsed.data.sellerUsername ?? null,
      sellerFirstName: parsed.data.sellerFirstName ?? null,
      productName: parsed.data.productName,
      category: parsed.data.category,
      location: parsed.data.location,
      priceAmount: parsed.data.priceAmount,
      currency: parsed.data.currency,
      condition: parsed.data.condition,
      note: parsed.data.note ?? null,
      contact: parsed.data.contact,
      photoFileIds: parsed.data.photoFileIds,
    };

    let listing: Awaited<ReturnType<typeof ListingRepository.create>>;

    try {
      listing = await ListingRepository.create(repositoryData);
    } catch (error: any) {
      const target = error?.meta?.target;
      const isSubmissionKeyConflict =
        error?.code === "P2002" &&
        (target === "submission_key" ||
          (Array.isArray(target) && target.includes("submission_key")));

      if (isSubmissionKeyConflict) {
        const existing = await ListingRepository.findBySubmissionKey(
          data.submissionKey,
        );
        if (existing) {
          if (
            existing.status === ListingStatus.PENDING &&
            !existing.adminGroupSentAt
          ) {
            try {
              const adminMessage =
                await this.telegramService.sendToAdminGroup(existing);

              await ListingRepository.markAdminGroupSent(
                existing.id,
                BigInt(adminMessage.message_id),
              );
            } catch (error) {
              logger.error(
                { err: error },
                "❌ Existing listing found but failed to resend admin notification:",
              );

              throw new Error(
                "Listing exists, but sending to admin group failed.",
              );
            }
          }

          return existing;
        }
      }
      throw error;
    }

    try {
      const adminMessage = await this.telegramService.sendToAdminGroup(listing);

      await ListingRepository.markAdminGroupSent(
        listing.id,
        BigInt(adminMessage.message_id),
      );
    } catch (error) {
      logger.error(
        { err: error, listingId: listing.id, publicId: listing.publicId },
        "❌ Listing saved but failed to send to admin group. " +
          "Manual resend or a future retry job is required.",
      );

      throw new Error("Listing was saved, but sending to admin group failed.");
    }

    return listing;
  }

  // ==========================================================
  // Approve listing
  // ==========================================================

  async approveListing(id: string): Promise<{ message: string }> {
    // ==========================================================
    // Get listing
    // ==========================================================

    const listing = await ListingRepository.findById(id);

    if (!listing) {
      throw new Error("Listing not found.");
    }

    // ==========================================================
    // Claim listing
    // ==========================================================

    const claimed = await ListingRepository.claimForApproval(id);

    if (!claimed) {
      throw new Error(
        "This listing has already been processed or is being processed.",
      );
    }

    // ==========================================================
    // Re-fetch after claim
    // ==========================================================
    //
    // This gets the latest version, including any admin edits.
    //

    const claimedListing = await ListingRepository.findById(id);

    if (!claimedListing) {
      throw new Error("Listing could not be retrieved after approval claim.");
    }

    // ==========================================================
    // Publish to Telegram
    // ==========================================================

    let telegramPublished = false;

    try {
      const channelMessage =
        await this.telegramService.publishToChannel(claimedListing);

      telegramPublished = true;

      // ========================================================
      // Finalize approval in database
      // ========================================================

      const approved = await ListingRepository.approve(
        id,
        channelMessage.message_id,
      );

      if (!approved) {
        throw new Error("Listing could not be marked as approved.");
      }

      // ========================================================
      // Notify seller
      // ========================================================

      try {
        await this.telegramService.notifySellerApproved(claimedListing);
      } catch (error) {
        /*
         * Approval already succeeded.
         *
         * Do NOT undo approval if seller notification fails.
         */

        logger.error(
          { err: error },
          "❌ Listing approved and published, but failed to notify seller:",
          {
            listingId: id,
            sellerTelegramId: claimedListing.sellerTelegramId,
            error,
          },
        );
      }

      // ========================================================
      // Return result to admin handler
      // ========================================================

      return {
        message:
          `✅ <b>အတည်ပြုပြီးပါပြီ</b>
        ` +
          `ပစ္စည်း: ${escapeHtml(claimedListing.productName)}
        ` +
          `ဈေးနှုန်း: ${claimedListing.priceAmount} ${escapeHtml(claimedListing.currency)}
        ` +
          `📢 Channel တွင် ဖော်ပြပြီးပါပြီ။`,
      };
    } catch (error) {
      // ========================================================
      // Telegram failed
      // ========================================================
      //
      // Nothing was published, so it is safe to return
      // the listing to PENDING.
      //

      if (!telegramPublished) {
        try {
          await ListingRepository.rollbackToPending(id);
        } catch (rollbackError) {
          logger.error(
            { err: error },
            `❌ Failed to rollback listing ${id} to PENDING:`,
            rollbackError,
          );
        }
      } else {
        // ======================================================
        // Telegram succeeded, DB finalization failed
        // ======================================================
        //
        // IMPORTANT:
        // Do NOT rollback to PENDING here.
        //
        // The Telegram post already exists. Returning to PENDING
        // could allow another approval and create a duplicate post.
        //

        logger.error(
          { err: error, listingId: id },
          `⚠️ Telegram published but database approval failed for listing ${id}. ` +
            `Manual intervention required. DO NOT use /resetlisting blindly.`,
        );
      }

      throw error;
    }
  }

  // ==========================================================
  // Reject listing
  // ==========================================================

  async rejectListing(id: string, reason: string) {
    const cleanReason = reason.trim();

    if (!cleanReason) {
      throw new Error("Rejection reason is required.");
    }

    const listing = await ListingRepository.findById(id);

    if (!listing) {
      throw new Error("Listing not found.");
    }

    const rejected = await ListingRepository.reject(id, cleanReason);

    if (!rejected) {
      throw new Error(
        "This listing has already been processed or is being processed.",
      );
    }

    // ========================================================
    // Notify seller
    // ========================================================

    try {
      await this.telegramService.notifySellerRejected(listing, cleanReason);
    } catch (error) {
      /*
       * Rejection already succeeded.
       *
       * Seller notification failure must NOT undo
       * the rejection.
       */

      logger.error(
        { err: error },
        "❌ Listing rejected, but failed to notify seller:",
        {
          listingId: id,
          sellerTelegramId: listing.sellerTelegramId,
        },
      );
    }

    return {
      message:
        `❌ <b>ပယ်ဖျက်ပြီးပါပြီ</b>
      ` +
        `ပစ္စည်း: ${escapeHtml(listing.productName)}
      ` +
        `အကြောင်းပြချက်: ${escapeHtml(cleanReason)}`,
    };
  }

  // ==========================================================
  // Mark as Sold Out
  // ==========================================================

  async markAsSoldOut(id: string) {
    const listing = await ListingRepository.updateAvailability(
      id,
      ListingAvailability.SOLD_OUT,
    );

    if (
      listing.status === ListingStatus.APPROVED &&
      listing.channelMessageId !== null
    ) {
      try {
        await this.telegramService.updateChannelListing(listing);
      } catch (error) {
        logger.error(
          { err: error },
          `⚠️ DB updated to SOLD_OUT but channel edit failed for listing ${id}. Admin can retry.`,
        );
        throw new Error(
          "DB updated to Sold Out, but channel edit failed. Please retry /soldout.",
        );
      }
    }

    return {
      message:
        `🔴 <b>Sold Out</b>
      ` + `ပစ္စည်း: ${escapeHtml(listing.productName)}`,
    };
  }

  // ==========================================================
  // Mark as Available
  // ==========================================================

  async markAsAvailable(id: string) {
    const listing = await ListingRepository.updateAvailability(
      id,
      ListingAvailability.AVAILABLE,
    );

    if (
      listing.status === ListingStatus.APPROVED &&
      listing.channelMessageId !== null
    ) {
      try {
        await this.telegramService.updateChannelListing(listing);
      } catch (error) {
        logger.error(
          { err: error },
          `⚠️ DB updated to Available but channel edit failed for listing ${id}. Admin can retry.`,
        );
        throw new Error(
          "DB updated to Available, but channel edit failed. Please retry /available.",
        );
      }
    }

    return {
      message:
        `🟢 <b>Available</b>
      ` + `ပစ္စည်း: ${escapeHtml(listing.productName)}`,
    };
  }

  async resetStuckApproving(id: string) {
    const listing = await ListingRepository.findById(id);

    if (!listing) {
      throw new Error("Listing not found.");
    }

    if (listing.status !== ListingStatus.APPROVING) {
      throw new Error("Only APPROVING listings can be reset.");
    }

    const reset = await ListingRepository.resetApprovingToPending(id);

    if (!reset) {
      throw new Error("Failed to reset listing.");
    }

    return {
      message: `✅ Listing ${id} ကို PENDING သို့ ပြန်ပြောင်းပြီးပါပြီ။`,
    };
  }
}
