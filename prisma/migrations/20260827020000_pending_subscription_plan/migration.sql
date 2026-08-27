-- Stage the target plan on the payment row instead of writing it straight
-- to subscriptions.plan/employee_limit at checkout time, so a tenant only
-- gets the new plan's benefits once payment is confirmed.
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "plan_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "plan_employee_limit" INTEGER NOT NULL DEFAULT 0;
