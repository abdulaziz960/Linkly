import { closeSync, mkdtempSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { spawnSync, spawn } from "node:child_process";

// An isolated SQLite database per run; never use the caller's database.
const directory = mkdtempSync(join(tmpdir(), "linkly-browser-"));
const databasePath = join(directory, "browser.db");
closeSync(openSync(databasePath, "wx"));
process.env.DATABASE_URL = `file:${databasePath}`;
process.env.AUTH_SECRET = "browser-test-only-auth-secret-at-least-32-characters";
process.env.INTEGRATION_ENCRYPTION_KEY = "browser-test-only-encryption-key";
process.env.META_APP_SECRET = "browser-test-meta-secret";
process.env.ATTRIBUTION_TENANT_ID = "browser-workspace";
process.env.NEXT_PUBLIC_SALES_WHATSAPP_NUMBER = "966555000000";
process.env.GEMINI_API_KEY = "";
process.env.DEMO_LOGIN_PASSWORD = "";
process.env.E2E_SEED_ENABLED = "";
process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD = "";
process.env.NEXT_TELEMETRY_DISABLED = "1";

function run(script, args = []) {
  const result = spawnSync(process.execPath, [resolve(script), ...args], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
run("scripts/prisma-generate.mjs");
run("node_modules/prisma/build/index.js", ["db", "push", "--schema", "prisma/.generated/schema.prisma", "--skip-generate"]);
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const salt = randomBytes(16).toString("hex");
const passwordHash = `scrypt$${salt}$${scryptSync("Browser-only-Password-927!", salt, 64).toString("hex")}`;
await prisma.userAccount.create({ data: {
  id: "browser-owner", name: "Browser Owner", email: "owner@browser.test", passwordHash,
  role: "مالك الحساب", tenantId: "browser-workspace", createdAt: new Date().toISOString()
} });
// Opt-in (E2E_WORKSPACES=1): an account that is switched on for projects, for e2e/workspaces.spec.ts. Everything else runs with the feature off.
if (process.env.E2E_WORKSPACES === "1") {
  process.env.WORKSPACES_FEATURE = "1";
  process.env.WORKSPACES_ENABLED_TENANTS = "browser-workspace";
  const nowIso = new Date().toISOString();
  await prisma.subscription.create({ data: {
    id: "sub-browser-workspace", tenantId: "browser-workspace", companyName: "شركة اختبار المتصفح", ownerName: "Browser Owner", ownerEmail: "owner@browser.test",
    plan: "باقة المؤسسات الكبيرة", status: "نشط", employeeLimit: 10, amount: 899, billingCycle: "شهري", renewalAt: new Date(Date.now() + 25 * 86400000).toISOString(), createdAt: nowIso, updatedAt: nowIso
  } });
  await prisma.employee.create({ data: {
    id: "browser-owner-employee", name: "Browser Owner", email: "owner@browser.test", role: "مالك الحساب", status: "متصل", permissions: "الكل", initial: "B", tenantId: "browser-workspace", userId: "browser-owner"
  } });
}
await prisma.plan.create({ data: {
  id: "browser-plan", name: "باقة اختبار المتصفح", monthlyPrice: 199,
  employeeLimit: 3, sortOrder: 1, active: 1,
  allowedChannels: "whatsapp", messageQuota: 1000,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
} });
await prisma.tenantFeatureGrant.create({ data: {
  id: "browser-real-estate-projects", tenantId: "browser-workspace", viewKey: "pipeline",
  grantedBy: "browser-test", createdAt: new Date().toISOString()
} });
await prisma.integrationSetting.create({ data: {
  id: "browser-whatsapp", tenantId: "browser-workspace", provider: "whatsapp_cloud", status: "connected",
  businessName: "Browser Workspace", wabaName: "Browser", phoneNumber: "966555000000", phoneNumberId: "browser-number-id",
  wabaId: "browser-waba", appId: "", verifyToken: "", accessToken: "", webhookUrl: "", updatedAt: new Date().toISOString()
} });
// Two campaigns for the campaigns page: one finished (with a failed and an opted-out recipient), one saved unsent.
const campaignDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
await prisma.campaign.create({ data: {
  id: "browser-campaign-done", tenantId: "browser-workspace", name: "حملة العرض الأخير", templateName: "promo", language: "ar",
  sent: 5, total: 7, progress: "71.4%", status: "الحملة أنجزت", description: "عرض نهاية الأسبوع", tags: "vip,رمضان", updatedAt: campaignDate
} });
await prisma.campaign.create({ data: {
  id: "browser-campaign-draft", tenantId: "browser-workspace", name: "حملة مجدولة", templateName: "welcome", language: "ar",
  sent: 0, total: 2, progress: "0%", status: "مجدولة", updatedAt: campaignDate
} });
await prisma.campaign.create({ data: {
  id: "browser-campaign-upcoming", tenantId: "browser-workspace", name: "حملة قادمة", templateName: "promo", language: "ar",
  scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  sent: 0, total: 3, progress: "0%", status: "مجدولة", updatedAt: campaignDate
} });
await prisma.campaignRecipient.createMany({ data: [0, 1, 2].map((index) => ({
  id: `browser-cr-upcoming-${index}`, campaignId: "browser-campaign-upcoming", tenantId: "browser-workspace", phone: `96652000000${index}`,
  name: `قادم ${index}`, status: "قيد الإرسال", createdAt: campaignDate
})) });
const recipientStates = [
  ["تم الإرسال", ""], ["تم الإرسال", ""], ["تم الإرسال", ""], ["تم الإرسال", ""], ["تم الإرسال", ""],
  ["فشل الإرسال", "(#131026) Message undeliverable"], ["فشل الإرسال", "ألغى العميل اشتراكه من رسائل الحملات"]
];
await prisma.campaignRecipient.createMany({ data: recipientStates.map(([status, error], index) => ({
  id: `browser-cr-${index}`, campaignId: "browser-campaign-done", tenantId: "browser-workspace", phone: `96650000000${index}`,
  name: `عميل ${index}`, status, error, messageId: status === "تم الإرسال" ? `wamid.${index}` : "", sentAt: status === "تم الإرسال" ? campaignDate : "",
  deliveredAt: index < 4 ? campaignDate : "", readAt: index < 2 ? campaignDate : "", repliedAt: index < 1 ? campaignDate : "", createdAt: campaignDate
})) });
await prisma.campaignRecipient.createMany({ data: [0, 1].map((index) => ({
  id: `browser-cr-draft-${index}`, campaignId: "browser-campaign-draft", tenantId: "browser-workspace", phone: `96651000000${index}`,
  name: `مسودة ${index}`, status: "قيد الإرسال", createdAt: campaignDate
})) });
await prisma.$disconnect();
run("node_modules/next/dist/bin/next", ["build"]);
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3217"], {
  stdio: "inherit", env: process.env
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code || 0));
