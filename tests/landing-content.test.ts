import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-landing-content.db");

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

describe("home page texts", () => {
  it("every editable default still appears in its page source", async () => {
    const { LANDING_SLOTS } = await import("../lib/landing-slots");
    const sources = { ar: readFileSync(join(process.cwd(), "app/page.tsx"), "utf8"), en: readFileSync(join(process.cwd(), "app/en/page.tsx"), "utf8") };
    for (const lang of ["ar", "en"] as const) {
      expect(LANDING_SLOTS[lang].length).toBeGreaterThan(20);
      for (const slot of LANDING_SLOTS[lang]) expect(sources[lang], `${lang}: ${slot.text}`).toContain(slot.text);
    }
  });

  it("saves overrides, falls back to the default, and rejects unknown texts", async () => {
    const { listLandingRows, saveLandingText, getLandingText, slotId, clearLandingCache } = await import("../lib/landing-content");
    const rows = await listLandingRows();
    const h1 = rows.find((row) => row.lang === "ar" && row.label.includes("H1") && row.text.startsWith("رد أسرع"))!;
    expect(h1.override).toBe("");

    expect(await saveLandingText("ar:doesnotexist", "x")).toMatchObject({ ok: false });
    expect(await saveLandingText(h1.id, "  عنوان جديد  ")).toMatchObject({ ok: true, override: "عنوان جديد" });
    clearLandingCache();
    expect((await getLandingText()).get(slotId("ar", h1.text))).toBe("عنوان جديد");
    expect((await listLandingRows()).find((row) => row.id === h1.id)?.override).toBe("عنوان جديد");

    const T = (await import("../app/LandingText")).default;
    expect(await T({ l: "ar", children: h1.text })).toBe("عنوان جديد");
    expect(await T({ l: "ar", children: "نص لا يوجد له تعديل" })).toBe("نص لا يوجد له تعديل");
    expect(await T({ l: "en", children: h1.text })).toBe(h1.text); // overrides are per language

    expect(await saveLandingText(h1.id, "   ")).toMatchObject({ ok: true, override: "" });
    clearLandingCache();
    expect(await T({ l: "ar", children: h1.text })).toBe(h1.text);
  });
});
