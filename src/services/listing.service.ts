import {
  ListingAvailability,
  ListingStatus,
  Category,
  Currency,
  Location,
} from "../types/listing";

import {
  ListingRepository,
  CreateListingRepositoryInput,
  UpdatePendingListingInput,
} from "../db/listing.repository";

import { TelegramService } from "./telegram.service";
import { listingInputSchema } from "../validators/listing.validator";

// ============================================================
// Create listing input
// ============================================================

export interface CreateListingInput {
  submissionKey: string;

  sellerTelegramId: number;

  sellerUsername?: string | null;
  sellerFirstName?: string | null;

  productName: string;
  category: Category;
  location: Location;

  priceAmount: number;
  currency: Currency;

  condition: string;
  note?: string | null;
  contact: string;

  photoFileIds: string[];
}

// ============================================================
// Listing service
// ============================================================

export class ListingService {
  constructor(private telegramService: TelegramService) {}

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
    const repositoryData: CreateListingRepositoryInput = {
      submissionKey: data.submissionKey,

      sellerTelegramId: data.sellerTelegramId,

      sellerUsername: data.sellerUsername ?? null,

      sellerFirstName: data.sellerFirstName ?? null,

      productName: data.productName,

      category: data.category,

      location: data.location,

      priceAmount: data.priceAmount,

      currency: data.currency,

      condition: data.condition,

      note: data.note ?? null,

      contact: data.contact,

      photoFileIds: data.photoFileIds,
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
          return existing;
        }
      }
      throw error;
    }

    // Now 'listing' is accessible here
    try {
      await this.telegramService.sendToAdminGroup(listing);
    } catch (error) {
      console.error(
        "❌ Listing saved but failed to send to admin group:",
        error,
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

        console.error(
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
          `✅ <b>အတည်ပြုပြီးပါပြီ</b>\n\n` +
          `ပစ္စည်း: ${claimedListing.productName}\n` +
          `ဈေးနှုန်း: ${claimedListing.priceAmount} ${claimedListing.currency}\n` +
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
          console.error(
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

        console.error(
          `⚠️ Telegram published but database approval failed for listing ${id}`,
          error,
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

      console.error("❌ Listing rejected, but failed to notify seller:", {
        listingId: id,
        sellerTelegramId: listing.sellerTelegramId,
        error,
      });
    }

    return {
      message:
        `❌ <b>ပယ်ဖျက်ပြီးပါပြီ</b>\n\n` +
        `ပစ္စည်း: ${listing.productName}\n` +
        `အကြောင်းပြချက်: ${cleanReason}`,
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
      await this.telegramService.updateChannelListing(listing);
    }

    return {
      message: `🔴 <b>Sold Out</b>\n\n` + `ပစ္စည်း: ${listing.productName}`,
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
      await this.telegramService.updateChannelListing(listing);
    }

    return {
      message: `🟢 <b>Available</b>\n\n` + `ပစ္စည်း: ${listing.productName}`,
    };
  }
}
