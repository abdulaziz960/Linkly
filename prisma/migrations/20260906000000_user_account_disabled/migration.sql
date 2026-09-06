-- Lets an owner/admin disable an individual account (blocking login
-- immediately) without deleting anything, mirroring the tenant-level
-- "متوقف" subscription status.
ALTER TABLE "user_accounts" ADD COLUMN IF NOT EXISTS "disabled" INTEGER NOT NULL DEFAULT 0;
