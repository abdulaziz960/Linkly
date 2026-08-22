-- Additive, idempotent production hardening applied after the historical baseline.
ALTER TABLE "user_accounts"
  ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "reset_at" TEXT NOT NULL,
  CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);
