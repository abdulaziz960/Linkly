-- Separate password-reset tokens from employee/owner/admin activation
-- tokens so a token minted for one purpose can't be consumed as the other.
ALTER TABLE "employee_invites" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'employee_activation';
