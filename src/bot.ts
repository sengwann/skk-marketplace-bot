import dotenv from "dotenv";
dotenv.config();

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  enabled: !!process.env.SENTRY_DSN,
});
import { Telegraf, Scenes, session, Markup } from "telegraf";
import { startSessionCleanup } from "./services/session-cleanup.service";
import { startAdminGroupRetry } from "./services/admin-group-retry.service";
import rateLimit from "express-rate-limit";
import express from "express";
import type { Agent } from "http";
import { logger } from "./utils/logger";
import { telegrafThrottler } from "telegraf-throttler";
import { config } from "./config";
import { MyContext, MyWizardSession } from "./types/listing";
import { sellScene } from "./scenes/sell.scene";
import { TelegramService } from "./services/telegram.service";
import { ListingService } from "./services/listing.service";
import { SettingService } from "./services/setting.service";
import { prisma, closeDatabase } from "./db/prisma";
import { registerAdminHandlers } from "./handlers/admin.handler";

// ============================================================
// Proxy
// ============================================================

function createProxyAgent(): Agent | undefined {
  if (process.env.SOCKS_PROXY) {
    return new (require("socks-proxy-agent").SocksProxyAgent)(
      process.env.SOCKS_PROXY,
    );
  }

  if (process.env.HTTP_PROXY) {
    return new (require("https-proxy-agent").HttpsProxyAgent)(
      process.env.HTTP_PROXY,
    );
  }

  return undefined;
}

const proxyAgent = createProxyAgent();

// ============================================================
// Bot
// ============================================================

const bot = new Telegraf<MyContext>(
  config.botToken,
  proxyAgent
    ? {
        telegram: {
          agent: proxyAgent,
        },
      }
    : undefined,
);

const throttler = telegrafThrottler();
bot.use(throttler);

// ============================================================
// Services
// ============================================================

const telegramService = new TelegramService(bot);
const listingService = new ListingService(telegramService);
const settingService = new SettingService();

// ============================================================
// Middleware
// ============================================================

bot.use((ctx, next) => {
  logger.debug(`📨 Telegram update: ${ctx.updateType}`);

  return next();
});

// Persistent/custom session type
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

const prismaSessionStore = {
  async get(key: string) {
    try {
      const row = await prisma.telegramSession.findUnique({
        where: { key },
      });

      if (!row) {
        return undefined;
      }

      if (row.expiresAt && row.expiresAt < new Date()) {
        await prisma.telegramSession
          .delete({
            where: { key },
          })
          .catch(() => {});

        return undefined;
      }

      return row.session as MyWizardSession;
    } catch (error) {
      logger.error({ err: error }, "❌ Failed to read session");
      return undefined;
    }
  },

  async set(key: string, value: MyWizardSession) {
    try {
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

      const cleanValue = JSON.parse(
        JSON.stringify(value ?? {}, (_key, val) =>
          typeof val === "bigint" ? val.toString() : val,
        ),
      );

      await prisma.telegramSession.upsert({
        where: { key },
        update: {
          session: cleanValue,
          expiresAt,
        },
        create: {
          key,
          session: cleanValue,
          expiresAt,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "❌ Failed to save session");
    }
  },

  async delete(key: string) {
    try {
      await prisma.telegramSession.deleteMany({
        where: { key },
      });
    } catch (error) {
      logger.error({ err: error }, "❌ Failed to delete session");
    }
  },
};

bot.use(
  session<MyWizardSession, MyContext>({
    getSessionKey: (ctx) => {
      if (!ctx.chat) {
        return undefined;
      }

      if (ctx.from) {
        return `${ctx.chat.id}:${ctx.from.id}`;
      }

      return `${ctx.chat.id}`;
    },
    defaultSession: () => ({}) as MyWizardSession,
    store: prismaSessionStore,
  }),
);

// Attach services to context
bot.use((ctx, next) => {
  ctx.listingService = listingService;
  ctx.settingService = settingService;

  return next();
});

// ============================================================
// Scene
// ============================================================

const stage = new Scenes.Stage<MyContext>([sellScene], {
  ttl: 3600,
});

bot.use(stage.middleware());

// ============================================================
// Commands
// ============================================================

const startHandler = async (ctx: MyContext) => {
  await ctx.reply(
    `မင်္ဂလာပါ။ ${config.channelName} bot မှ ကြိုဆိုပါတယ်။ 📦\n\nရွှေက္ကိုလ် နှင့် မြဝတီ မြို့နယ်အတွက် အထွေထွေ ရောင်းဝယ်မှု Bot တစ်ခု ဖြစ်ပါသည်။`,
    Markup.inlineKeyboard([
      [Markup.button.callback("🛍 ပစ္စည်းရောင်းမည်", "start_sell")],
      [Markup.button.callback("📜 စည်းကမ်းချက်များ", "rules")],
    ]),
  );
};

bot.command("start", startHandler);

const sellHandler = (ctx: MyContext) => {
  return ctx.scene.enter("SELL_SCENE");
};

bot.command("sell", sellHandler);

const rulesHandler = async (ctx: MyContext) => {
  const rulesText = await ctx.settingService.getRules();
  await ctx.reply(
    rulesText,
    Markup.inlineKeyboard([
      [Markup.button.callback("🛍 ပစ္စည်းရောင်းမည်", "start_sell")],
    ]),
  );
};

bot.command("rules", rulesHandler);

bot.command("cancel", async (ctx) => {
  if (ctx.scene.current) {
    await ctx.scene.leave();

    await ctx.reply(
      "❌ ပစ္စည်းတင်ခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။",
      Markup.removeKeyboard(),
    );
  } else {
    await ctx.reply("လက်ရှိတွင် ဖျက်သိမ်းရန် လုပ်ဆောင်ချက် မရှိပါ။");
  }
});

bot.catch((err, ctx) => {
  logger.error(
    { err: err },
    `Unhandled error for update ${ctx.updateType}:`,
    err,
  );
  ctx.reply("An unexpected error occurred. Please try again.").catch(() => {});
});

// ============================================================
// Callback Actions
// ============================================================

bot.action("start_sell", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});

  await ctx.scene.enter("SELL_SCENE");
});

bot.action("rules", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});

  const rulesText = await ctx.settingService.getRules();

  await ctx
    .editMessageText(
      rulesText,
      Markup.inlineKeyboard([
        Markup.button.callback("◀️ နောက်သို့", "back_to_start"),
      ]),
    )
    .catch(() => {});
});

bot.action("back_to_start", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});

  await ctx.deleteMessage().catch(() => {});

  await startHandler(ctx);
});

// ============================================================
// Admin Handlers
// ============================================================

registerAdminHandlers(bot, listingService, settingService);

// ============================================================
// Error Handling
// ============================================================

bot.catch((err, ctx) => {
  Sentry.captureException(err, {
    extra: {
      updateType: ctx.updateType,
      chatId: ctx.chat?.id,
      from: ctx.from?.id,
    },
  });

  logger.error({ err: err }, `\n❌ CRITICAL ERROR for ${ctx.updateType}:`);

  ctx
    .reply(
      "⚠️️ စနစ်ပိုင်းဆိုင်ရာ အမှားအယွင်း ဖြစ်ပေါ်နေပါသည်။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။",
    )
    .catch(() => {});
});

// ============================================================
// Express Server
// ============================================================

const PORT = Number(process.env.PORT) || 3000;

const WEBHOOK_PATH = process.env.WEBHOOK_PATH?.trim() || "/telegram/webhook";
const WEBHOOK_URL = `${config.webhookDomain}${WEBHOOK_PATH}`;

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

const app = express();

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready" });
  } catch (error) {
    logger.error({ err: error }, "❌ Readiness check failed:");
    res.status(503).json({ status: "not_ready" });
  }
});

app.use(express.json());

app.post(
  WEBHOOK_PATH,
  webhookLimiter,
  bot.webhookCallback(WEBHOOK_PATH, {
    secretToken: config.webhookSecret,
  }),
);

// ============================================================
// Start Server
// ============================================================

const server = app.listen(PORT, async () => {
  logger.info(`🌐 Health-check server running on port ${PORT}`);

  try {
    // Connect to PostgreSQL
    await prisma.$connect();
    logger.info("✅ PostgreSQL Database connected successfully via Prisma");

    // Configure Telegram webhook
    await bot.telegram.setWebhook(WEBHOOK_URL, {
      secret_token: config.webhookSecret,
    });
    logger.info(`✅ Webhook configured: ${WEBHOOK_URL}`);

    // ----------------------------------------------------
    // Command Menu Setup
    // ----------------------------------------------------

    // 1. Default menu for general users
    [
      { command: "start", description: "Start the bot" },
      { command: "sell", description: "Post a new item" },
      { command: "cancel", description: "Cancel active operation" },
      { command: "rules", description: "View rules" },
      { command: "setrules", description: "⚙️ Update rules" },
      { command: "soldout", description: "🔴 Mark listing sold out" },
      { command: "available", description: "🟢 Mark listing available" },
      { command: "resetlisting", description: "♻️ Reset stuck APPROVING" },
    ];

    // 2. Custom menu scoped exclusively for Admins
    const adminIds = (
      process.env.ADMIN_USER_IDS ||
      process.env.ADMIN_IDS ||
      process.env.ADMIN_ID ||
      ""
    )
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => !isNaN(id) && id > 0);

    for (const adminId of adminIds) {
      try {
        await bot.telegram.setMyCommands(
          [
            { command: "start", description: "Start the bot" },
            { command: "sell", description: "Post a new item" },
            { command: "cancel", description: "Cancel active operation" },
            { command: "rules", description: "View rules" },
            { command: "setrules", description: "⚙️ Update rules" },
          ],
          {
            scope: { type: "chat", chat_id: adminId },
          },
        );
      } catch (err) {
        Sentry.captureException(err);
        logger.error(
          { err: err },
          `❌ Failed to set admin commands for ID ${adminId}:`,
        );
      }
    }

    logger.info("✅ Bot menu commands configured successfully.");

    startSessionCleanup();
    startAdminGroupRetry(telegramService);
  } catch (err) {
    Sentry.captureException(err);
    logger.error({ err: err }, "\n❌ FAILED TO START:");

    server.close(() => {
      process.exit(1);
    });
  }
});

// ============================================================
// Graceful Shutdown
// ============================================================

const stopBot = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down...`);

  try {
    bot.stop(signal);

    await new Promise<void>((resolve) => {
      server.close(() => {
        logger.info("✅ HTTP server closed.");
        resolve();
      });
    });

    await closeDatabase();

    logger.info("✅ Database connection closed.");
    logger.info("✅ Shutdown complete.");
  } catch (error) {
    logger.error({ err: error }, "❌ Error during shutdown:");
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => {
  void stopBot("SIGINT");
});

process.once("SIGTERM", () => {
  void stopBot("SIGTERM");
});
