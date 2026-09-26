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
     *
     * Only one admin can successfully claim
     * the listing.
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
     *
     * The channel message ID is stored at the
     * same time as the approval state.
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
     * Only PENDING listings can be rejected.
     *
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
  // Rollback approval attempt
  // ==========================================================

  async rollbackToPending(
    id: string
  ): Promise<boolean> {
    /*
     * Used only when Telegram publishing fails.
     *
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
     * IMPORTANT:
     *
     * Availability only makes sense for an approved listing.
     *
     * Allowed:
     *
     * APPROVED + AVAILABLE
     *       ↓
     * SOLD_OUT
     *
     * APPROVED + SOLD_OUT
     *       ↓
     * AVAILABLE
     *
     * Not allowed:
     *
     * PENDING   → SOLD_OUT
     * REJECTED  → AVAILABLE
     * APPROVING → SOLD_OUT
     *
     * The status condition is included directly inside
     * updateMany(), making the check atomic.
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

    /*
     * If no row was updated, either:
     *
     * 1. The listing doesn't exist, or
     * 2. The listing is not APPROVED.
     *
     * Fetch the listing so we can give the caller
     * a useful error.
     */

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

    /*
     * The conditional update succeeded.
     *
     * Fetch the complete updated listing so the
     * service receives the same Listing entity shape
     * as before.
     */

    const updated =
      await prisma.listing.findUnique({
        where: {
          id,
        },
      });

    if (!updated) {
      /*
       * This should practically never happen because
       * the update above succeeded.
       *
       * Keep the check anyway so the repository never
       * returns an invalid value.
       */

      throw new Error(
        'Listing could not be retrieved after updating availability.'
      );
    }

    return mapToEntity(updated);
  },
};