import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-campaign-stuck-recipients.db");
const tenantId = "tenant-stuck-send";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

it("fails a send stuck past the cutoff, refunds its credit once, and leaves a fresh send alone", async () => {
  const { prisma } = await import("../lib/prisma");
  const { ensureSchema } = await import("../lib/database");
  const { releaseStuckCampaignRecipients } = await import("../lib/campaign-engine");
  await ensureSchema();

  const now = Date.now();
  await prisma.campaignBalance.create({ data: { tenantId, balance: 5, updatedAt: new Date(now).toISOString() } });
  const recipient = (id: string, claimedAt: string) => prisma.campaignRecipient.create({
    data: { id, campaignId: "camp-stuck", tenantId, phone: `9665${id.length}0000000`, status: "جارٍ الإرسال", claimedAt, createdAt: new Date(now).toISOString() }
  });
  await recipient("stuck-old", new Date(now - 30 * 60 * 1000).toISOString());
  await recipient("stuck-fresh", new Date(now - 60 * 1000).toISOString());

  expect(await releaseStuckCampaignRecipients()).toEqual({ released: 1 });
  // A second run (or an overlapping cron) must not refund the same send again.
  expect(await releaseStuckCampaignRecipients()).toEqual({ released: 0 });

  const old = await prisma.campaignRecipient.findUnique({ where: { id: "stuck-old" } });
  expect(old?.status).toBe("فشل الإرسال");
  expect(old?.error).not.toBe("");
  expect((await prisma.campaignRecipient.findUnique({ where: { id: "stuck-fresh" } }))?.status).toBe("جارٍ الإرسال");
  expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance).toBe(6);
});
