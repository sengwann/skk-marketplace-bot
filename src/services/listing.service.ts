import {
  ListingAvailability,
} from '../types/listing';

import {
  ListingRepository,
  CreateListingRepositoryInput,
} from '../db/listing.repository';

import {
  TelegramService,
} from './telegram.service';

import {
  Category,
  Currency,
  Location,
} from '../types/listing';

// ============================================================
// Create input
// ============================================================

export interface CreateListingInput {
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
// Service
// ============================================================

export class ListingService {
  constructor(
    private telegramService: TelegramService
  ) {}

  // ==========================================================
  // Create listing
  // ==========================================================

  async createListing(
    data: CreateListingInput
  ) {
    const repositoryData:
      CreateListingRepositoryInput = {
        sellerTelegramId:
          data.sellerTelegramId,

        sellerUsername:
          data.sellerUsername ?? null,

        sellerFirstName:
          data.sellerFirstName ?? null,

        productName:
          data.productName,

        category:
          data.category,

        location:
          data.location,

        priceAmount:
          data.priceAmount,

        currency:
          data.currency,

        condition:
          data.condition,

        note:
          data.note ?? null,

        contact:
          data.contact,

        photoFileIds:
          data.photoFileIds,
      };

    const listing =
      await ListingRepository.create(
        repositoryData
      );

    try {
      await this.telegramService.sendToAdminGroup(
        listing
      );
    } catch (error) {
      /*
       * The database listing already exists.
       *
       * We intentionally don't delete it here because
       * silently deleting a seller's submission can lose data.
       *
       * The error should be visible in Render logs so the
       * admin can investigate.
       */

      console.error(
        '❌ Listing saved but failed to send to admin group:',
        error
      );

      throw new Error(
        'Listing was saved, but sending to admin group failed.'
      );
    }

    return listing;
  }

  // ==========================================================
  // Approve listing
  // ==========================================================

  async approveListing(id: string) {
    const listing =
      await ListingRepository.findById(id);

    if (!listing) {
      throw new Error(
        'Listing not found.'
      );
    }

    /*
     * Atomically claim the listing.
     *
     * Only:
     *
     * PENDING → APPROVING
     *
     * is allowed.
     *
     * This prevents two admins from approving the same
     * listing at the same time.
     */

    const claimed =
      await ListingRepository.claimForApproval(id);

    if (!claimed) {
      throw new Error(
        'This listing has already been processed or is being processed.'
      );
    }

    let channelMessageId: number;

    // ========================================================
    // Step 1: Publish to Telegram channel
    // ========================================================

    try {
      const channelMessage =
        await this.telegramService.publishToChannel(
          listing
        );

      channelMessageId =
        channelMessage.message_id;
    } catch (error) {
      /*
       * Telegram definitely failed.
       *
       * The listing was not successfully published,
       * so it is safe to return it to PENDING.
       *
       * This allows an admin to retry the approval.
       */

      await ListingRepository
        .rollbackToPending(id)
        .catch((rollbackError) => {
          console.error(
            '❌ Failed to rollback listing to PENDING:',
            rollbackError
          );
        });

      throw error;
    }

    // ========================================================
    // Step 2: Finalize database approval
    // ========================================================

    try {
      const approved =
        await ListingRepository.approve(
          id,
          channelMessageId
        );

      if (!approved) {
        throw new Error(
          'Listing could not be marked as approved.'
        );
      }
    } catch (error) {
      /*
       * IMPORTANT:
       *
       * Telegram has ALREADY published the listing.
       *
       * Therefore we MUST NOT do:
       *
       * rollbackToPending()
       *
       * here.
       *
       * If we changed the listing back to PENDING and
       * another admin clicked Approve, the bot could publish
       * the same listing to the channel a second time.
       *
       * We intentionally leave it as APPROVING.
       *
       * A future reconciliation process can safely inspect
       * APPROVING listings and complete the database update.
       */

      console.error(
        '❌ Telegram published the listing, but database finalization failed:',
        {
          listingId: id,
          channelMessageId,
          error,
        }
      );

      throw new Error(
        'Listing was published to the channel, but the database could not finalize the approval.'
      );
    }

    // ========================================================
    // Success
    // ========================================================

    return {
      message:
        `✅ <b>အတည်ပြုပြီးပါပြီ</b>\n\n` +
        `ပစ္စည်း: ${listing.productName}\n` +
        `ဈေးနှုန်း: ${listing.priceAmount} ${listing.currency}\n` +
        `📢 Channel တွင် ဖော်ပြပြီးပါပြီ။`,
    };
  }

  // ==========================================================
  // Reject listing
  // ==========================================================

  async rejectListing(
    id: string,
    reason: string
  ) {
    const cleanReason =
      reason.trim();

    if (!cleanReason) {
      throw new Error(
        'Rejection reason is required.'
      );
    }

    const listing =
      await ListingRepository.findById(id);

    if (!listing) {
      throw new Error(
        'Listing not found.'
      );
    }

    const rejected =
      await ListingRepository.reject(
        id,
        cleanReason
      );

    if (!rejected) {
      throw new Error(
        'This listing has already been processed or is being processed.'
      );
    }

    return {
      message:
        `❌ <b>ပယ်ဖျက်ပြီးပါပြီ</b>\n\n` +
        `ပစ္စည်း: ${listing.productName}\n` +
        `အကြောင်းပြချက်: ${cleanReason}`,
    };
  }

  // ==========================================================
  // Mark sold out
  // ==========================================================

  async markAsSoldOut(
    id: string
  ) {
    const listing =
      await ListingRepository.updateAvailability(
        id,
        ListingAvailability.SOLD_OUT
      );

    /*
     * If this listing is already published,
     * update the channel post too.
     */

    if (
      listing.status === 'APPROVED' &&
      listing.channelMessageId !== null
    ) {
      await this.telegramService.updateChannelListing(
        listing
      );
    }

    return {
      message:
        `🔴 <b>Sold Out</b>\n\n` +
        `ပစ္စည်း: ${listing.productName}`,
    };
  }

  // ==========================================================
  // Mark available
  // ==========================================================

  async markAsAvailable(
    id: string
  ) {
    const listing =
      await ListingRepository.updateAvailability(
        id,
        ListingAvailability.AVAILABLE
      );

    if (
      listing.status === 'APPROVED' &&
      listing.channelMessageId !== null
    ) {
      await this.telegramService.updateChannelListing(
        listing
      );
    }

    return {
      message:
        `🟢 <b>Available</b>\n\n` +
        `ပစ္စည်း: ${listing.productName}`,
    };
  }
}