import dotenv from "dotenv";

dotenv.config();

// ============================================================
// Environment helper
// ============================================================

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }

  return value;
}

// ============================================================
// Admin IDs
// ============================================================

function parseAdminIds(value: string): number[] {
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => {
      const parsed = Number(id);

      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`❌ Invalid ADMIN_USER_IDS value: ${id}`);
      }

      return parsed;
    });

  if (ids.length === 0) {
    throw new Error(
      "❌ ADMIN_USER_IDS must contain at least one Telegram user ID.",
    );
  }

  return [...new Set(ids)];
}

// ============================================================
// Config
// ============================================================
const webhookDomain = requireEnv("WEBHOOK_DOMAIN").replace(/\/$/, "");

if (
  process.env.NODE_ENV === "production" &&
  !webhookDomain.startsWith("https://")
) {
  throw new Error("WEBHOOK_DOMAIN must use HTTPS in production.");
}

export const config = {
  botToken: requireEnv("BOT_TOKEN"),
  adminChatId: requireEnv("ADMIN_CHAT_ID"),
  channelId: requireEnv("CHANNEL_ID"),
  adminUserIds: parseAdminIds(requireEnv("ADMIN_USER_IDS")),
  channelName: requireEnv("CHANNEL_NAME"),

  webhookDomain,
  webhookSecret: requireEnv("WEBHOOK_SECRET_TOKEN"),
};
