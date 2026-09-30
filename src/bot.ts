import { Telegraf, Scenes, session, Markup } from "telegraf";
import express from "express";
import type { Agent } from "http";
import dotenv from "dotenv";

import { config } from "./config";
import { MyContext, MyWizardSession } from "./types/listing";
import { sellScene } from "./scenes/sell.scene";
import { TelegramService } from "./services/telegram.service";
import { ListingService } from "./services/listing.service";
import { SettingService } from "./services/setting.service";
import { prisma, closeDatabase } from "./db/prisma";
import { registerAdminHandlers } from "./handlers/admin.handler";

dotenv.config();

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
  console.log(`📨 Telegram update: ${ctx.updateType}`);

  return next();
});

// Persistent/custom session type
bot.use(
  session<MyWizardSession, MyContext>({
    defaultSession: () => ({}) as MyWizardSession,
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
  console.error(`\n❌ CRITICAL ERROR for ${ctx.updateType}:`, err);

  ctx
    .reply(
      "⚠️️ စနစ်ပိုင်းဆိုင်ရာ အမှားအယွင်း ဖြစ်ပေါ်နေပါသည်။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။",
    )
    .catch(() => {});
});

// ============================================================
// Express Server
// ============================================================

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/telegram/webhook";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET_TOKEN;

const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || `http://localhost:${PORT}`;

const WEBHOOK_URL = `${WEBHOOK_DOMAIN.replace(/\/$/, "")}${WEBHOOK_PATH}`;

// ============================================================
// Health Checks
// ============================================================

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready" });
  } catch (error) {
    console.error("❌ Readiness check failed:", error);
    res.status(503).json({ status: "not_ready" });
  }
});

// ============================================================
// JSON Body Parser & Webhook
// ============================================================

app.use(express.json());

app.use(
  bot.webhookCallback(WEBHOOK_PATH, {
    secretToken: WEBHOOK_SECRET,
  }),
);

// ============================================================
// Start Server
// ============================================================

const server = app.listen(PORT, async () => {
  console.log(`🌐 Health-check server running on port ${PORT}`);

  try {
    // Connect to PostgreSQL
    await prisma.$connect();
    console.log("✅ PostgreSQL Database connected successfully via Prisma");

    // Configure Telegram webhook
    await bot.telegram.setWebhook(WEBHOOK_URL, {
      secret_token: WEBHOOK_SECRET,
    });
    console.log(`✅ Webhook configured: ${WEBHOOK_URL}`);

    // ----------------------------------------------------
    // Command Menu Setup
    // ----------------------------------------------------

    // 1. Default menu for general users
    await bot.telegram.setMyCommands([
      { command: "start", description: "Start the bot" },
      { command: "sell", description: "Post a new item" },
      { command: "cancel", description: "Cancel active operation" },
    ]);

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
        console.error(
          `❌ Failed to set admin commands for ID ${adminId}:`,
          err,
        );
      }
    }

    console.log("✅ Bot menu commands configured successfully.");
  } catch (err) {
    console.error("\n❌ FAILED TO START:", err);

    server.close(() => {
      process.exit(1);
    });
  }
});

// ============================================================
// Graceful Shutdown
// ============================================================

const stopBot = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down...`);

  try {
    bot.stop(signal);

    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log("✅ HTTP server closed.");
        resolve();
      });
    });

    await closeDatabase();

    console.log("✅ Database connection closed.");
    console.log("✅ Shutdown complete.");
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => {
  void stopBot("SIGINT");
});

process.once("SIGTERM", () => {
  void stopBot("SIGTERM");
});
