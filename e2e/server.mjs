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
await prisma.integrationSetting.create({ data: {
  id: "browser-whatsapp", tenantId: "browser-workspace", provider: "whatsapp_cloud", status: "connected",
  businessName: "Browser Workspace", wabaName: "Browser", phoneNumber: "966555000000", phoneNumberId: "browser-number-id",
  wabaId: "browser-waba", appId: "", verifyToken: "", accessToken: "", webhookUrl: "", updatedAt: new Date().toISOString()
} });
await prisma.$disconnect();
run("node_modules/next/dist/bin/next", ["build"]);
const server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3217"], {
  stdio: "inherit", env: process.env
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code || 0));
