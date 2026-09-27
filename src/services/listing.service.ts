import {
  ListingAvailability,
} from '../types/listing';

import {
  UpdatePendingListingInput,
} from '../db/listing.repository';

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

export class ListingService {
  constructor(
    private telegramService: TelegramService
  ) {}
  async updatePendingListing(
  id: string,
  data: UpdatePendingListingInput
) {
  const listing =
    await ListingRepository.findById(id);

  if (!listing) {
    throw new Error(
      'Listing not found.'
    );
  }

  if (listing.status !== 'PENDING') {
    throw new Error(
      'Only pending listings can be edited.'
    );
  }

  const updated =
    await ListingRepository.updatePendingListing(
      id,
      data
    );

  return updated;
}
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

  async approveListing(id: string) {
    const listing =
      await ListingRepository.findById(id);

    if (!listing) {
      throw new Error(
        'Listing not found.'
      );
    }

    const claimed =
      await ListingRepository.claimForApproval(id);

    if (!claimed) {
      throw new Error(
        'This listing has already been processed or is being processed.'
      );
    }

    let channelMessageId: number;

    try {
      const channelMessage =
        await this.telegramService.publishToChannel(
          listing
        );

      channelMessageId =
        channelMessage.message_id;
    } catch (error) {
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

    /*
     * At this point:
     *
     * Telegram channel publish = successful
     * Database status = APPROVED
     *
     * Therefore seller notification failure
     * must NOT make the approval fail.
     */
    try {
  await this.telegramService.notifySellerApproved(
    listing
  );
} catch (error) {
  console.error(
    '❌ Listing approved and published, but failed to notify seller:',
    {
      listingId: id,
      sellerTelegramId:
        listing.sellerTelegramId,
      error,
    }
  );
}

    return {
      message:
        `✅ <b>အတည်ပြုပြီးပါပြီ</b>\n\n` +
        `ပစ္စည်း: ${listing.productName}\n` +
        `ဈေးနှုန်း: ${listing.priceAmount} ${listing.currency}\n` +
        `📢 Channel တွင် ဖော်ပြပြီးပါပြီ။`,
    };
  }

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

    /*
     * At this point:
     *
     * Database status = REJECTED
     *
     * Therefore seller notification failure
     * must NOT make the rejection fail.
     */
   try {
  await this.telegramService.notifySellerRejected(
    listing,
    cleanReason
  );
} catch (error) {
  console.error(
    '❌ Listing rejected, but failed to notify seller:',
    {
      listingId: id,
      sellerTelegramId:
        listing.sellerTelegramId,
      error,
    }
  );
}

    return {
      message:
        `❌ <b>ပယ်ဖျက်ပြီးပါပြီ</b>\n\n` +
        `ပစ္စည်း: ${listing.productName}\n` +
        `အကြောင်းပြချက်: ${cleanReason}`,
    };
  }

  async markAsSoldOut(id: string) {
    const listing =
      await ListingRepository.updateAvailability(
        id,
        ListingAvailability.SOLD_OUT
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
        `🔴 <b>Sold Out</b>\n\n` +
        `ပစ္စည်း: ${listing.productName}`,
    };
  }

  async markAsAvailable(id: string) {
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