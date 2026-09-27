
import {
  Listing,
  Category,
  Location,
  ListingStatus,
  ListingAvailability,
  Currency,
} from '../types/listing';

import {
  ListingStatus as PrismaListingStatus,
  ListingAvailability as PrismaListingAvailability,
} from '@prisma/client';

import { prisma } from './prisma';

// ============================================================
// Create input
// ============================================================

export interface CreateListingRepositoryInput {
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
}

// ============================================================
// Update pending listing input
// ============================================================

export interface UpdatePendingListingInput {
  productName?: string;
  category?: Category;
  location?: Location;
  priceAmount?: number;
  currency?: Currency;
  condition?: string;
  note?: string | null;
  contact?: string;
}

// ============================================================
// Prisma model → Application entity
// ============================================================

function mapToEntity(
  model: {
    id: string;
    sellerTelegramId: bigint;
    sellerUsername: string | null;
    sellerFirstName: string | null;

    productName: string;
    category: string;
    location: string;

    priceAmount: number;
    currency: string;

    condition: string;
    note: string | null;
    contact: string;

    photoFileIds: string[];

    status: PrismaListingStatus;
    availability: PrismaListingAvailability;

    rejectionReason: string | null;
    channelMessageId: bigint | null;

    createdAt: Date;
  }
): Listing {
  return {
    id: model.id,

    sellerTelegramId:
      Number(model.sellerTelegramId),

    sellerUsername:
      model.sellerUsername,

    sellerFirstName:
      model.sellerFirstName,

    productName:
      model.productName,

    category:
      model.category as Category,

    location:
      model.location as Location,

    priceAmount:
      model.priceAmount,

    currency:
      model.currency as Currency,

    condition:
      model.condition,

    note:
      model.note,

    contact:
      model.contact,

    photoFileIds:
      model.photoFileIds,

    status:
      model.status as ListingStatus,

    availability:
      model.availability as ListingAvailability,

    rejectionReason:
      model.rejectionReason,

    channelMessageId:
      model.channelMessageId === null
        ? null
        : Number(model.channelMessageId),

    createdAt:
      model.createdAt,
  };
}

// ============================================================
// Repository
// ============================================================

export const ListingRepository = {

  // ==========================================================
  // Create listing
  // ==========================================================

  async create(
    data: CreateListingRepositoryInput
  ): Promise<Listing> {
    const created =
      await prisma.listing.create({
        data: {
          sellerTelegramId:
            BigInt(data.sellerTelegramId),

          sellerUsername:
            data.sellerUsername,

          sellerFirstName:
            data.sellerFirstName,

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
            data.note,

          contact:
            data.contact,

          photoFileIds:
            data.photoFileIds,

          status:
            ListingStatus.PENDING,

          availability:
            ListingAvailability.AVAILABLE,
        },
      });

    return mapToEntity(created);
  },

  // ==========================================================
  // Find listing
  // ==========================================================

  async findById(
    id: string
  ): Promise<Listing | null> {
    const listing =
      await prisma.listing.findUnique({
        where: {
          id,
        },
      });

    if (!listing) {
      return null;
    }

    return mapToEntity(listing);
  },

  // ==========================================================
  // Claim listing for approval
  // ==========================================================

  async claimForApproval(
    id: string
  ): Promise<boolean> {
    /*
     * Atomic state transition:
     *
     * PENDING → APPROVING
     */

    const result =
      await prisma.listing.updateMany({
        where: {
          id,
          status: ListingStatus.PENDING,
        },

        data: {
          status:
            ListingStatus.APPROVING,
        },
      });

    return result.count === 1;
  },

  // ==========================================================
  // Finalize approval
  // ==========================================================

  async approve(
    id: string,
    channelMessageId: number
  ): Promise<boolean> {
    /*
     * Atomic state transition:
     *
     * APPROVING → APPROVED
     */

    const result =
      await prisma.listing.updateMany({
        where: {
          id,
          status: ListingStatus.APPROVING,
        },

        data: {
          status:
            ListingStatus.APPROVED,

          channelMessageId:
            BigInt(channelMessageId),
        },
      });

    return result.count === 1;
  },

  // ==========================================================
  // Reject listing
  // ==========================================================

  async reject(
    id: string,
    reason: string
  ): Promise<boolean> {
    /*
     * Atomic state transition:
     *
     * PENDING → REJECTED
     */

    const result =
      await prisma.listing.updateMany({
        where: {
          id,
          status: ListingStatus.PENDING,
        },

        data: {
          status:
            ListingStatus.REJECTED,

          rejectionReason:
            reason,
        },
      });

    return result.count === 1;
  },

  // ==========================================================
  // Update pending listing
  // ==========================================================

  async updatePendingListing(
    id: string,
    data: UpdatePendingListingInput
  ): Promise<Listing> {
    /*
     * Only PENDING listings may be edited.
     *
     * We check the current state first so the admin
     * receives a useful error.
     */

    const existing =
      await prisma.listing.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      throw new Error(
        'Listing not found.'
      );
    }

    if (
      existing.status !==
      ListingStatus.PENDING
    ) {
      throw new Error(
        'Only pending listings can be edited.'
      );
    }

    /*
     * Save the original seller values only once.
     *
     * If the listing has already been edited before,
     * originalData remains unchanged.
     */

    const originalData =
      existing.originalData ??
      {
        productName:
          existing.productName,

        category:
          existing.category,

        location:
          existing.location,

        priceAmount:
          existing.priceAmount,

        currency:
          existing.currency,

        condition:
          existing.condition,

        note:
          existing.note,

        contact:
          existing.contact,
      };

    /*
     * The WHERE clause includes PENDING again.
     *
     * This protects against a race where another
     * admin approves/rejects the listing after the
     * first check above.
     */

    const result =
      await prisma.listing.updateMany({
        where: {
          id,

          status:
            ListingStatus.PENDING,
        },

        data: {
          ...(data.productName !== undefined && {
            productName:
              data.productName,
          }),

          ...(data.category !== undefined && {
            category:
              data.category,
          }),

          ...(data.location !== undefined && {
            location:
              data.location,
          }),

          ...(data.priceAmount !== undefined && {
            priceAmount:
              data.priceAmount,
          }),

          ...(data.currency !== undefined && {
            currency:
              data.currency,
          }),

          ...(data.condition !== undefined && {
            condition:
              data.condition,
          }),

          ...(data.note !== undefined && {
            note:
              data.note,
          }),

          ...(data.contact !== undefined && {
            contact:
              data.contact,
          }),

          originalData,
        },
      });

    if (result.count !== 1) {
      throw new Error(
        'This listing has already been processed or is being processed.'
      );
    }

    const updated =
      await prisma.listing.findUnique({
        where: {
          id,
        },
      });

    if (!updated) {
      throw new Error(
        'Listing could not be retrieved after editing.'
      );
    }

    return mapToEntity(updated);
  },

  // ==========================================================
  // Rollback approval attempt
  // ==========================================================

  async rollbackToPending(
    id: string
  ): Promise<boolean> {
    /*
     * Atomic state transition:
     *
     * APPROVING → PENDING
     */

    const result =
      await prisma.listing.updateMany({
        where: {
          id,
          status: ListingStatus.APPROVING,
        },

        data: {
          status:
            ListingStatus.PENDING,
        },
      });

    return result.count === 1;
  },

  // ==========================================================
  // Update availability
  // ==========================================================

  async updateAvailability(
    id: string,
    availability: ListingAvailability
  ): Promise<Listing> {
    /*
     * Availability only makes sense for APPROVED listings.
     */

    const result =
      await prisma.listing.updateMany({
        where: {
          id,

          status:
            ListingStatus.APPROVED,
        },

        data: {
          availability,
        },
      });

    if (result.count !== 1) {
      const listing =
        await prisma.listing.findUnique({
          where: {
            id,
          },

          select: {
            id: true,
            status: true,
          },
        });

      if (!listing) {
        throw new Error(
          'Listing not found.'
        );
      }

      throw new Error(
        'Only approved listings can change availability.'
      );
    }

    const updated =
      await prisma.listing.findUnique({
        where: {
          id,
        },
      });

    if (!updated) {
      throw new Error(
        'Listing could not be retrieved after updating availability.'
      );
    }

    return mapToEntity(updated);
  },
};
