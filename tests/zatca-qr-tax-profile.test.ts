import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { zatcaQrPayload, zatcaQrSvg, zatcaTimestamp } from "../lib/zatca-qr";
import { isValidVatNumber, normalizeVatNumber } from "../lib/tax-profile";

const testDbPath = join(process.cwd(), "tests", ".tmp-tax-profile.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

/** Reads the tag-length-value runs back out of the Base64 payload. */
function readTlv(payload: string) {
  const bytes = Buffer.from(payload, "base64");
  const fields = new Map<number, string>();
  for (let index = 0; index < bytes.length;) {
    const tag = bytes[index];
    const length = bytes[index + 1];
    fields.set(tag, bytes.subarray(index + 2, index + 2 + length).toString("utf8"));
    index += 2 + length;
  }
  return fields;
}

describe("invoice QR code (ZATCA format)", () => {
  it("carries the five fields as tag-length-value, Base64 encoded", () => {
    const payload = zatcaQrPayload({ sellerName: "شركة الجمهور المخصص للدعاية والاعلان", vatNumber: "311643962400003", timestamp: "2026-10-25T15:30:45.123Z", total: 401.35, vat: 52.35 });
    const fields = readTlv(payload);
    expect(fields.get(1)).toBe("شركة الجمهور المخصص للدعاية والاعلان");
    expect(fields.get(2)).toBe("311643962400003");
    expect(fields.get(3)).toBe("2026-10-25T15:30:45Z");
    expect(fields.get(4)).toBe("401.35");
    expect(fields.get(5)).toBe("52.35");
    expect(fields.size).toBe(5);
  });

  it("writes the time in UTC without milliseconds and renders an SVG", async () => {
    expect(zatcaTimestamp(new Date("2026-01-02T03:04:05.999Z"))).toBe("2026-01-02T03:04:05Z");
    const svg = await zatcaQrSvg({ sellerName: "x", vatNumber: "311643962400003", timestamp: "2026-10-25T15:30:45Z", total: 115, vat: 15 });
    expect(svg).toContain("<svg");
  });
});

describe("the customer's own tax details", () => {
  it("accepts a 15-digit number that starts and ends with 3, in Arabic or Latin digits", () => {
    expect(isValidVatNumber("311643962400003")).toBe(true);
    expect(isValidVatNumber("411643962400003")).toBe(false);
    expect(isValidVatNumber("31164396240003")).toBe(false);
    expect(normalizeVatNumber(" ٣١١٦٤٣٩٦٢٤٠٠٠٠٣ ")).toBe("311643962400003");
  });

  it("saves, reads back, clears, and rejects a bad number", async () => {
    const { saveTaxProfile, getTaxProfile } = await import("../lib/tax-profile");
    expect(await getTaxProfile("tenant-tax")).toEqual({ vatNumber: "", address: "" });
    expect((await saveTaxProfile("tenant-tax", { vatNumber: "12345", address: "x" })).ok).toBe(false);
    const saved = await saveTaxProfile("tenant-tax", { vatNumber: "٣١١٦٤٣٩٦٢٤٠٠٠٠٣", address: "  الرياض   حي النخيل " });
    expect(saved).toEqual({ ok: true, profile: { vatNumber: "311643962400003", address: "الرياض حي النخيل" } });
    expect(await getTaxProfile("tenant-tax")).toEqual({ vatNumber: "311643962400003", address: "الرياض حي النخيل" });
    expect((await saveTaxProfile("tenant-tax", { vatNumber: "", address: "" })).ok).toBe(true);
    expect((await getTaxProfile("tenant-tax")).vatNumber).toBe("");
  });
});
