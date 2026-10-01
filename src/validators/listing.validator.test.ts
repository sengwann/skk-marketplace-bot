import { describe, it, expect } from "vitest";
import { validateListingInput } from "./listing.validator";

// ============================================================
// Helper: valid base input
// ============================================================
function validInput() {
  return {
    submissionKey: "123e4567-e89b-12d3-a456-426614174000",
    sellerTelegramId: BigInt(12345655),
    productName: "iPhone 15 Pro",
    category: "ELECTRONICS" as const,
    location: "MYAWADDY" as const,
    priceAmount: 250000,
    currency: "MMK" as const,
    condition: "90% clean",
    contact: "09123456789",
    photoFileIds: ["file-id-1"],
  };
}

// ============================================================
// Tests
// ============================================================
describe("validateListingInput", () => {
  // ----------------------------------------------------------
  // PASS cases
  // ----------------------------------------------------------
  describe("valid inputs", () => {
    it("should pass with all required fields", () => {
      const result = validateListingInput(validInput());
      expect(result.success).toBe(true);
    });

    it("should pass with optional fields included", () => {
      const input = {
        ...validInput(),
        sellerUsername: "john_doe",
        sellerFirstName: "John",
        note: "Original box included",
      };

      const result = validateListingInput(input);
      expect(result.success).toBe(true);
    });

    it("should pass with note set to null", () => {
      const input = {
        ...validInput(),
        note: null,
      };

      const result = validateListingInput(input);
      expect(result.success).toBe(true);
    });

    it("should pass with sellerUsername and sellerFirstName as null", () => {
      const input = {
        ...validInput(),
        sellerUsername: null,
        sellerFirstName: null,
      };

      const result = validateListingInput(input);
      expect(result.success).toBe(true);
    });

    it("should pass with maximum allowed photo count (6)", () => {
      const input = {
        ...validInput(),
        photoFileIds: [
          "file-1",
          "file-2",
          "file-3",
          "file-4",
          "file-5",
          "file-6",
        ],
      };

      const result = validateListingInput(input);
      expect(result.success).toBe(true);
    });

    it("should pass with THB currency", () => {
      const input = {
        ...validInput(),
        currency: "THB",
        priceAmount: 500,
      };

      const result = validateListingInput(input);
      expect(result.success).toBe(true);
    });

    it("should pass with decimal price", () => {
      const input = {
        ...validInput(),
        priceAmount: 99.99,
      };

      const result = validateListingInput(input);
      expect(result.success).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // FAIL: missing required fields
  // ----------------------------------------------------------
  describe("missing required fields", () => {
    it("should fail when productName is missing", () => {
      const { productName, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when category is missing", () => {
      const { category, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when location is missing", () => {
      const { location, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when priceAmount is missing", () => {
      const { priceAmount, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when currency is missing", () => {
      const { currency, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when condition is missing", () => {
      const { condition, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when contact is missing", () => {
      const { contact, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when photoFileIds is missing", () => {
      const { photoFileIds, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when sellerTelegramId is missing", () => {
      const { sellerTelegramId, ...input } = validInput();
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // FAIL: invalid values
  // ----------------------------------------------------------
  describe("invalid values", () => {
    it("should fail with negative price", () => {
      const input = { ...validInput(), priceAmount: -100 };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with zero price", () => {
      const input = { ...validInput(), priceAmount: 0 };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with non-finite price (Infinity)", () => {
      const input = { ...validInput(), priceAmount: Infinity };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with price exceeding max limit", () => {
      const input = { ...validInput(), priceAmount: 2_000_000_000_000 };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with invalid category", () => {
      const input = { ...validInput(), category: "INVALID_CATEGORY" };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with invalid location", () => {
      const input = { ...validInput(), location: "YANGON" };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with invalid currency", () => {
      const input = { ...validInput(), currency: "USD" };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with negative sellerTelegramId", () => {
      const input = { ...validInput(), sellerTelegramId: -1 };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with non-integer sellerTelegramId", () => {
      const input = { ...validInput(), sellerTelegramId: 123.45 };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // FAIL: empty strings
  // ----------------------------------------------------------
  describe("empty strings", () => {
    it("should fail with empty productName", () => {
      const input = { ...validInput(), productName: "" };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with whitespace-only productName", () => {
      const input = { ...validInput(), productName: "   " };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with empty condition", () => {
      const input = { ...validInput(), condition: "" };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with empty contact", () => {
      const input = { ...validInput(), contact: "" };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // FAIL: length limits
  // ----------------------------------------------------------
  describe("length limits", () => {
    it("should fail when productName exceeds 120 characters", () => {
      const input = { ...validInput(), productName: "A".repeat(121) };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when condition exceeds 300 characters", () => {
      const input = { ...validInput(), condition: "B".repeat(301) };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when note exceeds 500 characters", () => {
      const input = { ...validInput(), note: "C".repeat(501) };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when contact exceeds 100 characters", () => {
      const input = { ...validInput(), contact: "D".repeat(101) };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when sellerUsername exceeds 64 characters", () => {
      const input = { ...validInput(), sellerUsername: "E".repeat(65) };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail when sellerFirstName exceeds 128 characters", () => {
      const input = { ...validInput(), sellerFirstName: "F".repeat(129) };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // FAIL: photoFileIds constraints
  // ----------------------------------------------------------
  describe("photoFileIds constraints", () => {
    it("should fail with empty photoFileIds array", () => {
      const input = { ...validInput(), photoFileIds: [] };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with more than 6 photos", () => {
      const input = {
        ...validInput(),
        photoFileIds: ["f1", "f2", "f3", "f4", "f5", "f6", "f7"],
      };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });

    it("should fail with empty string in photoFileIds", () => {
      const input = { ...validInput(), photoFileIds: [""] };
      const result = validateListingInput(input);
      expect(result.success).toBe(false);
    });
  });
});
