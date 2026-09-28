import { Context } from "telegraf";
import { config } from "../config";

export function isAdmin(ctx: Context): boolean {
  return !!ctx.from && config.adminUserIds.includes(ctx.from.id);
}

export function isAdminChat(ctx: Context): boolean {
  return !!ctx.chat && ctx.chat.id.toString() === config.adminChatId.toString();
}

export function isAuthorizedAdmin(ctx: Context): boolean {
  return isAdmin(ctx) && isAdminChat(ctx);
}
