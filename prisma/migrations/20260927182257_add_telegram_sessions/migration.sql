-- CreateTable
CREATE TABLE "telegram_sessions" (
    "key" TEXT NOT NULL,
    "session" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "telegram_sessions_pkey" PRIMARY KEY ("key")
);
