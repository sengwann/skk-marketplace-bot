import {
  Listing,
  Category,
  Location,
  ListingStatus,
  ListingAvailability,
  Currency,
  CreateListingInput,
} from "../types/listing";

import {
  ListingStatus as PrismaListingStatus,
  ListingAvailability as PrismaListingAvailability,
} from "../generated/prisma/client";
import { generateListingId } from "../utils/idGenerator";

import { prisma } from "./prisma";

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

function mapToEntity(model: {
  id: string;
  publicId: string;
  adminGroupSentAt: Date | null;
  adminGroupMessageId: bigint | null;
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

  originalData: unknown;

  createdAt: Date;
}): Listing {
  return {
    id: model.id,
    publicId: model.publicId,
    adminGroupSentAt: model.adminGroupSentAt,
    adminGroupMessageId:
      model.adminGroupMessageId === null
        ? null
        : BigInt(model.adminGroupMessageId),
    sellerTelegramId: model.sellerTelegramId,

    sellerUsername: model.sellerUsername,

    sellerFirstName: model.sellerFirstName,

    productName: model.productName,

    category: model.category as Category,

    location: model.location as Location,

    priceAmount: model.priceAmount,

    currency: model.currency as Currency,

    condition: model.condition,

    note: model.note,

    contact: model.contact,

    photoFileIds: model.photoFileIds,

    status: model.status as ListingStatus,

    availability: model.availability as ListingAvailability,

    rejectionReason: model.rejectionReason,

    channelMessageId:
      model.channelMessageId === null ? null : BigInt(model.channelMessageId),

    createdAt: model.createdAt,
  };
}

// ============================================================
// Repository
// ============================================================

export const ListingRepository = {
  async findByPublicId(publicId: string): Promise<Listing | null> {
    const listing = await prisma.listing.findUnique({
      where: {
        publicId,
      },
    });

    if (!listing) {
      return null;
    }

    return mapToEntity(listing);
  },
  // ==========================================================
  // Find by submission key
  // ==========================================================
  async markAdminGroupSent(
    id: string,
    adminGroupMessageId?: bigint,
  ): Promise<boolean> {
    const result = await prisma.listing.updateMany({
      where: {
        id,
        status: PrismaListingStatus.PENDING,
      },
      data: {
        adminGroupSentAt: new Date(),
        ...(adminGroupMessageId !== undefined && {
          adminGroupMessageId: BigInt(adminGroupMessageId),
        }),
      },
    });

    return result.count === 1;
  },

  async resetApprovingToPending(id: string): Promise<boolean> {
    const result = await prisma.listing.updateMany({
      where: {
        id,
        status: PrismaListingStatus.APPROVING,
      },
      data: {
        status: PrismaListingStatus.PENDING,
        approvalStartedAt: null,
      },
    });

    return result.count === 1;
  },

  async findBySubmissionKey(submissionKey: string): Promise<Listing | null> {
    const listing = await prisma.listing.findUnique({
      where: {
        submissionKey,
      },
    });

    if (!listing) {
      return null;
    }

    return mapToEntity(listing);
  },

  // ==========================================================
  // Create listing
  // ==========================================================

  async create(data: CreateListingInput): Promise<Listing> {
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const publicId = generateListingId();

      try {
        const created = await prisma.listing.create({
          data: {
            publicId,
            submissionKey: data.submissionKey,
            sellerTelegramId: BigInt(data.sellerTelegramId),
            sellerUsername: data.sellerUsername,
            sellerFirstName: data.sellerFirstName,
            productName: data.productName,
            category: data.category,
            location: data.location,
            priceAmount: data.priceAmount,
            currency: data.currency,
            condition: data.condition,
            note: data.note,
            contact: data.contact,
            photoFileIds: data.photoFileIds,
            status: PrismaListingStatus.PENDING,
            availability: PrismaListingAvailability.AVAILABLE,
          },
        });

        return mapToEntity(created);
      } catch (error: any) {
        const target = error?.meta?.target;

        const isPublicIdConflict =
          error?.code === "P2002" &&
          (target === "public_id" ||
            (Array.isArray(target) && target.includes("public_id")));

        if (!isPublicIdConflict) {
          throw error;
        }

        // If publicId collision, retry with new ID
      }
    }

    throw new Error("Could not generate unique public listing ID.");
  },

  // ==========================================================
  // Find listing by ID
  // ==========================================================

  async findById(id: string): Promise<Listing | null> {
    const listing = await prisma.listing.findUnique({
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

  async claimForApproval(id: string): Promise<boolean> {
    /*
     * Atomic state transition:
     *
     * PENDING → APPROVING
     *
     * Only one admin can successfully claim the listing.
     */

    const result = await prisma.listing.updateMany({
      where: {
        id,
        status: PrismaListingStatus.PENDING,
      },

      data: {
        status: PrismaListingStatus.APPROVING,
        approvalStartedAt: new Date(),
      },
    });

    return result.count === 1;
  },

  // ==========================================================
  // Finalize approval
  // ==========================================================

  async approve(id: string, channelMessageId: number): Promise<boolean> {
    /*
     * Atomic state transition:
     *
     * APPROVING → APPROVED
     */

    const result = await prisma.listing.updateMany({
      where: {
        id,
        status: PrismaListingStatus.APPROVING,
      },

      data: {
        status: PrismaListingStatus.APPROVED,

        channelMessageId: BigInt(channelMessageId),
      },
    });

    return result.count === 1;
  },

  // ==========================================================
  // Reject listing
  // ==========================================================

  async reject(id: string, reason: string): Promise<boolean> {
    /*
     * Atomic state transition:
     *
     * PENDING → REJECTED
     */

    const result = await prisma.listing.updateMany({
      where: {
        id,
        status: PrismaListingStatus.PENDING,
      },

      data: {
        status: PrismaListingStatus.REJECTED,

        rejectionReason: reason,
      },
    });

    return result.count === 1;
  },

  // ==========================================================
  // Update pending listing
  // ==========================================================

  async updatePendingListing(
    id: string,
    data: UpdatePendingListingInput,
  ): Promise<Listing> {
    /*
     * First check whether the listing exists.
     */

    const existing = await prisma.listing.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      throw new Error("Listing not found.");
    }

    /*
     * Only PENDING listings can be edited.
     */

    if (existing.status !== PrismaListingStatus.PENDING) {
      throw new Error("Only pending listings can be edited.");
    }

    /*
     * Save the original values only the first time
     * the listing is edited.
     *
     * If originalData already exists, keep it unchanged.
     */

    const originalData = existing.originalData ?? {
      productName: existing.productName,
      category: existing.category,
      location: existing.location,
      priceAmount: existing.priceAmount,
      currency: existing.currency,
      condition: existing.condition,
      note: existing.note,
      contact: existing.contact,
    };

    /*
     * The WHERE clause checks PENDING again.
     *
     * This protects against a race condition where
     * another admin processes the listing between
     * the findUnique() above and updateMany().
     */

    const result = await prisma.listing.updateMany({
      where: {
        id,
        status: PrismaListingStatus.PENDING,
      },

      data: {
        ...(data.productName !== undefined && {
          productName: data.productName,
        }),

        ...(data.category !== undefined && {
          category: data.category,
        }),

        ...(data.location !== undefined && {
          location: data.location,
        }),

        ...(data.priceAmount !== undefined && {
          priceAmount: data.priceAmount,
        }),

        ...(data.currency !== undefined && {
          currency: data.currency,
        }),

        ...(data.condition !== undefined && {
          condition: data.condition,
        }),

        ...(data.note !== undefined && {
          note: data.note,
        }),

        ...(data.contact !== undefined && {
          contact: data.contact,
        }),

        originalData,
      },
    });

    if (result.count !== 1) {
      throw new Error(
        "This listing has already been processed or is being processed.",
      );
    }

    /*
     * Get the updated listing.
     */

    const updated = await prisma.listing.findUnique({
      where: {
        id,
      },
    });

    if (!updated) {
      throw new Error("Listing could not be retrieved after editing.");
    }

    return mapToEntity(updated);
  },

  // ==========================================================
  // Rollback approval attempt
  // ==========================================================

  async rollbackToPending(id: string): Promise<boolean> {
    /*
     * Atomic state transition:
     *
     * APPROVING → PENDING
     */

    const result = await prisma.listing.updateMany({
      where: {
        id,
        status: PrismaListingStatus.APPROVING,
      },

      data: {
        status: PrismaListingStatus.PENDING,
      },
    });

    return result.count === 1;
  },

  // ==========================================================
  // Update availability
  // ==========================================================

  async updateAvailability(
    id: string,
    availability: ListingAvailability,
  ): Promise<Listing> {
    /*
     * Availability can only be changed for
     * APPROVED listings.
     */

    const result = await prisma.listing.updateMany({
      where: {
        id,
        status: PrismaListingStatus.APPROVED,
      },

      data: {
        availability,
      },
    });

    /*
     * Nothing was updated.
     *
     * Find out whether the listing doesn't exist
     * or whether its status is incorrect.
     */

    if (result.count !== 1) {
      const listing = await prisma.listing.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          status: true,
        },
      });

      if (!listing) {
        throw new Error("Listing not found.");
      }

      throw new Error("Only approved listings can change availability.");
    }

    /*
     * Return the updated entity.
     */

    const updated = await prisma.listing.findUnique({
      where: {
        id,
      },
    });

    if (!updated) {
      throw new Error(
        "Listing could not be retrieved after updating availability.",
      );
    }

    return mapToEntity(updated);
  },
};
