# SKK Marketplace Bot

A Telegram marketplace bot for buying and selling items in **ShweKok Ko** and **Myawaddy**. Sellers submit listings via a guided wizard, admins review and approve them in a private group, and approved listings are published to a public channel.

Built with **Telegraf**, **Prisma**, **PostgreSQL**, and **Express** (webhook mode).

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database setup](#database-setup)
- [Running the bot](#running-the-bot)
- [Bot commands](#bot-commands)
- [Listing lifecycle](#listing-lifecycle)
- [Admin workflow](#admin-workflow)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

### For sellers
- Guided multi-step wizard (`/sell`) with inline keyboards.
- Supports up to 6 photos per listing.
- Categories: Electronics, Fashion, Home, Vehicle, Other.
- Locations: ShweKok Ko, Myawaddy.
- Currencies: MMK, THB.
- Optional note field.
- Review screen before submission.
- Cancel anytime with `/cancel`.
- Direct-message notifications when their listing is approved or rejected.

### For admins
- Private admin group receives every new listing with photo preview.
- Approve, reject (with reason), or edit listings before publishing.
- Edit any field in a pending listing with a live preview.
- Mark approved listings as **Sold Out** or **Available** via inline buttons or `/soldout` / `/available` commands.
- Recover stuck listings with `/resetlisting`.
- Update community rules with `/setrules`.

### Reliability
- Atomic state transitions (`PENDING → APPROVING → APPROVED`).
- Idempotent listing creation via `submissionKey`.
- Persistent session storage in PostgreSQL.
- Automatic session cleanup.
- Graceful shutdown.
- Sentry error tracking.
- Webhook rate limiting.
- Health and readiness endpoints.

---

## Architecture

```
Telegram  ──▶  Express (webhook)  ──▶  Telegraf (MyContext)
                                          │
                                          ├── session middleware (Postgres)
                                          ├── admin handlers
                                          ├── sell wizard scene
                                          └── services
                                                 │
                                                 ├── ListingService
                                                 ├── TelegramService
                                                 └── SettingService
                                                        │
                                                        ▼
                                                Prisma  ──▶  PostgreSQL
```

---

## Requirements

- **Node.js** 18+ (20+ recommended)
- **PostgreSQL** 13+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- An admin Telegram group (private)
- A public Telegram channel
- A public HTTPS domain (for webhook mode)

---

## Installation

```bash
git clone <your-repo-url>
cd skk-marketplace
npm install
```

---

## Configuration

Create a `.env` file in the project root. All variables below are required unless noted otherwise.

```env
# ── Telegram ─────────────────────────────────────────────
BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
ADMIN_CHAT_ID=-1001234567890
CHANNEL_ID=-1009876543210
CHANNEL_NAME="SKK Marketplace"
ADMIN_USER_IDS=123456789,987654321

# ── Webhook ──────────────────────────────────────────────
WEBHOOK_DOMAIN=https://bot.example.com
WEBHOOK_SECRET_TOKEN=some-long-random-secret
WEBHOOK_PATH=/telegram/webhook
PORT=3000

# ── Database ─────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@host:5432/skk?schema=public
# Optional, only if your Postgres requires a custom CA in production:
# DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"

# ── Runtime ──────────────────────────────────────────────
NODE_ENV=production
LOG_LEVEL=info

# ── Optional integrations ────────────────────────────────
SENTRY_DSN=
# SOCKS_PROXY=socks5://127.0.0.1:1080
# HTTP_PROXY=http://127.0.0.1:8080
```

### Variable reference

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Telegram bot token from BotFather |
| `ADMIN_CHAT_ID` | ✅ | Numeric ID of the private admin group (negative) |
| `CHANNEL_ID` | ✅ | Numeric ID of the public channel (negative) |
| `ADMIN_USER_IDS` | ✅ | Comma-separated Telegram user IDs allowed to act as admin |
| `CHANNEL_NAME` | ✅ | Display name shown in `/start` |
| `WEBHOOK_DOMAIN` | ✅ | Public HTTPS URL of this server (no trailing slash) |
| `WEBHOOK_SECRET_TOKEN` | ✅ | Random secret validated on every webhook call |
| `WEBHOOK_PATH` | ➖ | Path for the webhook endpoint (default `/telegram/webhook`) |
| `PORT` | ➖ | HTTP port (default `3000`) |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `DATABASE_CA_CERT` | ➖ | Custom CA certificate for managed Postgres (production only) |
| `NODE_ENV` | ➖ | `production` enables TLS, JSON logs, Sentry |
| `LOG_LEVEL` | ➖ | `debug` / `info` / `warn` / `error` |
| `SENTRY_DSN` | ➖ | Enables Sentry error tracking |
| `SOCKS_PROXY` | ➖ | Socks proxy for Telegram API calls |
| `HTTP_PROXY` | ➖ | HTTP(S) proxy for Telegram API calls |

> **Tip:** Get your own Telegram ID from [@userinfobot](https://t.me/userinfobot). To find a group or channel ID, forward a message to [@userinfobot](https://t.me/userinfobot) or use a bot like [@RawDataBot](https://t.me/RawDataBot).

---

## Database setup

The project uses **Prisma** with PostgreSQL.

```bash
# Generate the Prisma client into src/generated/prisma
npx prisma generate

# Apply migrations (production)
npx prisma migrate deploy

# Or, during development:
npx prisma migrate dev
```

### Models

- **`Listing`** — one row per submitted item. Tracks status, availability, seller info, Telegram message IDs, and audit fields.
- **`TelegramSession`** — persistent wizard/admin sessions with expiry.
- **`AppSetting`** — key/value store (used for community rules).

### Enums

- `ListingStatus` — `PENDING`, `APPROVING`, `APPROVED`, `REJECTED`
- `ListingAvailability` — `AVAILABLE`, `SOLD_OUT`

---

## Running the bot

### Development

```bash
npm run dev
```

The server starts on `PORT`, connects to Postgres, and registers the webhook with Telegram.

### Production

```bash
npm run build
npm start
```

### Health checks

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Liveness — returns `{ "status": "ok" }` |
| `GET /readyz` | Readiness — pings the database, returns `503` if down |

---

## Bot commands

### Public (all users)

| Command | Description |
|---|---|
| `/start` | Show the welcome menu |
| `/sell` | Start the listing wizard |
| `/cancel` | Cancel the active listing wizard |
| `/rules` | View community rules |

### Admin-only

Admins must also be members of the admin group.

| Command | Description |
|---|---|
| `/setrules <text>` | Replace the community rules |
| `/soldout SKxxxxxxx` | Mark an approved listing as Sold Out |
| `/available SKxxxxxxx` | Mark a listing as Available again |
| `/resetlisting <id>` | Roll back a stuck `APPROVING` listing to `PENDING` |

---

## Listing lifecycle

```
PENDING ──claim──▶ APPROVING ──publish──▶ APPROVED
   │                    │
   │                    └──rollback──▶ PENDING
   │
   └──reject──▶ REJECTED
```

- **PENDING** — submitted by seller, waiting for admin action.
- **APPROVING** — an admin has claimed it and the bot is publishing to the channel.
- **APPROVED** — live in the channel. Can be toggled `AVAILABLE` / `SOLD_OUT`.
- **REJECTED** — declined by an admin; the seller is notified with a reason.

Every listing gets a public ID like `SK7K2M9XQ`, used for `/soldout` and `/available`.

---

## Admin workflow

1. A new listing arrives in the admin group with photos and inline buttons.
2. Admin taps one of:
   - **✏️ ပြင်ဆင်မည်** — edit product name, category, location, price, currency, condition, note, or contact. Changes stay in a draft until **💾 Save**.
   - **✅ အတည်ပြုမည်** — publish to the channel and notify the seller.
   - **❌ ငြင်းပယ်မည်** — reply with a reason; the seller is notified.
3. After approval, the control message is replaced with a **🔴 Sold Out** button.
4. Tapping it flips the listing to `SOLD_OUT` and edits the channel post in place.
5. The button becomes **🟢 Available** to reverse the change.

Stuck listings can be reset with `/resetlisting <internal-id>` — the internal ID (not the public `SK...` ID) is logged whenever a claim starts.

---

## Project structure

```
prisma/
└── schema.prisma              # Prisma schema (Listing, TelegramSession, AppSetting)

src/
├── bot.ts                     # Bot bootstrap, middleware, webhook, health checks
├── config.ts                  # Environment loading and validation
├── db/
│   ├── prisma.ts              # PrismaClient + pg adapter
│   ├── listing.repository.ts  # Listing data access with atomic transitions
│   └── setting.repository.ts  # AppSetting key/value store
├── handlers/
│   └── admin.handler.ts       # All admin commands, callbacks, edit flow
├── middleware/
│   └── adminAuth.ts           # isAdmin / isAuthorizedAdmin helpers
├── scenes/
│   └── sell.scene.ts          # Multi-step listing wizard
├── services/
│   ├── listing.service.ts     # Business logic (create, approve, reject, availability)
│   ├── telegram.service.ts    # Admin group, channel, and DM notifications
│   ├── setting.service.ts     # Rules management
│   └── session-cleanup.service.ts  # Cron for expired sessions
├── types/
│   └── listing.ts             # Enums, entities, session types
├── utils/
│   ├── formatListing.ts       # Channel message formatter
│   ├── htmlEscape.ts          # HTML escaping for Telegram
│   ├── idGenerator.ts         # Public listing ID generator
│   └── logger.ts              # Pino logger
└── validators/
    └── listing.validator.ts   # Zod schema for listing input
```

---

## Deployment

### 1. Prepare the server

- Ubuntu 22.04+ or equivalent
- Node.js 20 LTS
- PostgreSQL 15+
- A reverse proxy (Caddy / Nginx) with a valid TLS certificate

### 2. Build and run

```bash
npm ci
npx prisma migrate deploy
npm run build
NODE_ENV=production node dist/bot.js
```

### 3. Recommended process manager

Use **systemd**, **PM2**, or a container. Example systemd unit:

```ini
[Unit]
Description=SKK Marketplace Bot
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/skk-marketplace
EnvironmentFile=/opt/skk-marketplace/.env
ExecStart=/usr/bin/node dist/bot.js
Restart=on-failure
RestartSec=5
User=skk

[Install]
WantedBy=multi-user.target
```

### 4. Reverse proxy

The bot exposes an HTTP server and expects Telegram to reach it over HTTPS:

```
https://bot.example.com/telegram/webhook  →  127.0.0.1:3000
```

Make sure `WEBHOOK_DOMAIN` matches the public hostname **without** a trailing slash.

### 5. Post-deploy checklist

- [ ] `.env` contains every required variable.
- [ ] `npx prisma migrate deploy` runs cleanly.
- [ ] `GET /healthz` returns `200`.
- [ ] `GET /readyz` returns `200`.
- [ ] Bot responds to `/start` in a private chat.
- [ ] Bot receives updates in the admin group.
- [ ] `/sell` completes end-to-end.
- [ ] Admin approve publishes to the channel.
- [ ] Seller receives a DM on approval/rejection.
- [ ] `/soldout` and `/available` edit the channel post.

---

## Troubleshooting

### Bot is not receiving messages

- Verify `WEBHOOK_DOMAIN` is HTTPS and reachable from the public internet.
- Check `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` for errors.
- Ensure `WEBHOOK_SECRET_TOKEN` matches on both sides.
- If updates are being dropped, raise `webhookLimiter.max` in `src/bot.ts`.

### "DATABASE_URL environment variable is missing"

The `.env` file is not being loaded. Confirm it exists at the project root and that `dotenv.config()` runs before any Prisma import.

### Prisma client errors after a schema change

```bash
npx prisma generate
```

### Seller did not receive a DM

- The seller may have blocked the bot.
- Check logs for `❌ ... failed to notify seller`.
- Notifications are best-effort — the DB state is still updated correctly.

### Listing stuck in `APPROVING`

Use `/resetlisting <internal-id>`. The internal ID is logged when the claim starts. If the listing was already published to the channel but the DB update failed, **do not** reset it blindly — the channel post already exists.

### `/soldout` fails with "channel edit failed"

The DB was updated but Telegram rejected the edit. Retry the command — it is idempotent.

---

## License

MIT. See `LICENSE` for details.