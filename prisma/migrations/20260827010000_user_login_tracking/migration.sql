-- Track each account's most recent login for the Users management page.
ALTER TABLE "user_accounts" ADD COLUMN IF NOT EXISTS "last_login_at" TEXT NOT NULL DEFAULT '';
ALTER TABLE "user_accounts" ADD COLUMN IF NOT EXISTS "last_login_ip" TEXT NOT NULL DEFAULT '';
