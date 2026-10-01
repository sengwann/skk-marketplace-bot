import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 7;

export function generateListingId(): string {
  let code = "";

  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }

  return `SK${code}`;
}

// For existing test compatibility
export const generateId = generateListingId;
