import { Context } from "telegraf";
import { config } from "../config";

// ============================================================
// Existing Functions (Left Untouched)
// ============================================================

export function isAdmin(ctx: Context): boolean {
  return !!ctx.from && config.adminUserIds.includes(ctx.from.id);
}

export function isAdminChat(ctx: Context): boolean {
  return !!ctx.chat && ctx.chat.id.toString() === config.adminChatId.toString();
}

export function isAuthorizedAdmin(ctx: Context): boolean {
  return isAdmin(ctx) && isAdminChat(ctx);
}

// ============================================================
// New Version (For Private Chat & Group Commands)
// ============================================================

/**
 * Checks if the user is an admin OR if the update comes from the Admin Chat.
 * Works for commands sent in direct messages (PMs) with the bot.
 */
export function isAuthorizedAdminUser(ctx: Context): boolean {
  if (!ctx.from) return false;

  const currentUserId = String(ctx.from.id);
  const currentChatId = ctx.chat ? String(ctx.chat.id) : "";

  // 1. Check if the user is in the admin array (returns boolean)
  const isUserAdmin = config.adminUserIds.some(
    (adminId) => String(adminId).trim() === currentUserId,
  );

  const isGroupAdminChat =
    Boolean(config.adminChatId) && String(config.adminChatId) === currentChatId;

  return isUserAdmin || isGroupAdminChat;
}
