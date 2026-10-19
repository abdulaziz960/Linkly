import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-bot-trail.db");

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

describe("bot menu trail", () => {
  it("keeps the menus in order and ignores a repeat of the last one", async () => {
    const { getMenuTrail, pushMenu, setMenuTrail } = await import("../lib/bot-trail");
    const id = "conv-trail-1";
    expect(await getMenuTrail(id)).toEqual([]);
    await pushMenu(id, "a");
    await pushMenu(id, "b");
    await pushMenu(id, "b");
    expect(await getMenuTrail(id)).toEqual(["a", "b"]);
    await setMenuTrail(id, ["a"]);
    expect(await getMenuTrail(id)).toEqual(["a"]);
  });
});
