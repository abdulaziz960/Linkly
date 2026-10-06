import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-renewal-followups.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("shared renewal follow-ups", () => {
  it("starts empty, stores the last editor and overwrites per tenant", async () => {
    const { getRenewalFollowUps, setRenewalFollowUp, isFollowUpStatus } = await import("../lib/renewal-followups");
    expect(await getRenewalFollowUps()).toEqual({});

    await setRenewalFollowUp("t1", "progress", "a@x.com");
    await setRenewalFollowUp("t2", "closed", "b@x.com");
    await setRenewalFollowUp("t1", "contacted", "b@x.com");

    const all = await getRenewalFollowUps();
    expect(Object.keys(all).sort()).toEqual(["t1", "t2"]);
    expect(all.t1).toMatchObject({ status: "contacted", updatedBy: "b@x.com" });
    expect(all.t2.status).toBe("closed");
    expect(isFollowUpStatus("closed")).toBe(true);
    expect(isFollowUpStatus("bogus")).toBe(false);
  });
});
