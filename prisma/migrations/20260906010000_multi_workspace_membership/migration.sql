-- Multi-workspace membership: lets one login (UserAccount) hold a
-- separate Employee row - its own role/permissions - in more than one
-- tenant, instead of exactly one tenant per email forever.

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "user_id" TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "employees_user_id_idx" ON "employees" ("user_id");

-- One-time backfill: every existing Employee row today has a matching
-- UserAccount created alongside it (same email), so this recovers the
-- link with no ambiguity for historical rows.
UPDATE "employees" SET "user_id" = "user_accounts"."id"
FROM "user_accounts"
WHERE "employees"."user_id" = ''
  AND lower("user_accounts"."email") = lower("employees"."email");

ALTER TABLE "employee_invites" ADD COLUMN IF NOT EXISTS "invite_tenant_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "employee_invites" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT '';
ALTER TABLE "employee_invites" ADD COLUMN IF NOT EXISTS "permissions" TEXT NOT NULL DEFAULT '';
