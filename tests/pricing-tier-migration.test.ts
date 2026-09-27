import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// This lives in its own file (rather than as a describe block inside
// pricing-tier-channels.test.ts) because lib/prisma.ts caches its
// PrismaClient on globalThis - vi.resetModules() + a new DATABASE_URL
// mid-file does NOT swap which database the client is actually connected
// to. Vitest isolates globalThis per test file, so a dedicated file with
// one fixed DATABASE_URL for its whole lifetime is the only reliable way
// to exercise this migration against a distinct, pre-populated database.
const migrationDbPath = join(process.cwd(), "tests", ".tmp-pricing-tier-migration.db");

beforeAll(() => {
  if (existsSync(migrationDbPath)) unlinkSync(migrationDbPath);
  vi.stubEnv("DATABASE_URL", `file:${migrationDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${migrationDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("2026 pricing tier restructure - migrating pre-existing production-like data", () => {
  it("deactivates pre-existing old-named plans (without deleting or renaming them) while creating the 5 new tiers", async () => {
    const { prisma } = await import("../lib/prisma");
    // Bootstrap just the plans table by hand with the 3 original plans
    // already in it and already active, simulating a real production
    // database at the moment this migration first runs against it.
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, monthly_price INTEGER NOT NULL DEFAULT 0,
      employee_limit INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      ai_daily_limit INTEGER NOT NULL DEFAULT 0, ai_monthly_limit INTEGER NOT NULL DEFAULT 0,
      allowed_channels TEXT NOT NULL DEFAULT '*', message_quota INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    const now = new Date().toISOString();
    await prisma.plan.createMany({
      data: [
        { id: "plan-starter", name: "باقة البداية", monthlyPrice: 249, employeeLimit: 1, sortOrder: 1, active: 1, createdAt: now, updatedAt: now },
        { id: "plan-growth", name: "باقة النمو", monthlyPrice: 499, employeeLimit: 3, sortOrder: 2, active: 1, createdAt: now, updatedAt: now },
        { id: "plan-business", name: "باقة الأعمال", monthlyPrice: 999, employeeLimit: 10, sortOrder: 3, active: 1, createdAt: now, updatedAt: now }
      ]
    });

    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();

    const originalPlans = await prisma.plan.findMany({ where: { name: { in: ["باقة البداية", "باقة النمو", "باقة الأعمال"] } } });
    expect(originalPlans).toHaveLength(3);
    expect(originalPlans.every((plan) => plan.active === 0)).toBe(true);
    // Untouched otherwise - an existing subscriber's employeeLimit/price
    // never silently changes underneath them.
    expect(originalPlans.find((plan) => plan.name === "باقة النمو")?.monthlyPrice).toBe(499);
    expect(originalPlans.find((plan) => plan.name === "باقة النمو")?.employeeLimit).toBe(3);

    const newTiers = await prisma.plan.findMany({ where: { name: "باقة الأفراد" } });
    expect(newTiers).toHaveLength(1);
  });
});
