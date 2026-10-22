import { describe, expect, it } from "vitest";
import { DEFAULT_SALLA_STATUSES, parseSallaStatuses, updateSallaOrderStatus } from "../lib/salla";

describe("salla order status management", () => {
  it("parses the statuses list and skips entries without a slug or duplicates", () => {
    const parsed = parseSallaStatuses({ data: [
      { id: 1, name: "قيد التنفيذ", slug: "in_progress" },
      { id: 2, name: "حالة مخصصة" },
      { id: 3, name: "تم الشحن", slug: "shipped" },
      { id: 4, name: "مكرر", slug: "shipped" }
    ] });
    expect(parsed).toEqual([{ slug: "in_progress", label: "قيد التنفيذ" }, { slug: "shipped", label: "تم الشحن" }]);
  });

  it("returns an empty list for unexpected payloads", () => {
    expect(parseSallaStatuses(null)).toEqual([]);
    expect(parseSallaStatuses({ data: "x" })).toEqual([]);
  });

  it("ships a default status list covering the common slugs", () => {
    const slugs = DEFAULT_SALLA_STATUSES.map((status) => status.slug);
    expect(slugs).toEqual(expect.arrayContaining(["in_progress", "shipped", "delivered", "canceled"]));
  });

  it("rejects malformed ids and slugs before any network call", async () => {
    expect((await updateSallaOrderStatus("t1", "../orders", "shipped")).status).toBe(400);
    expect((await updateSallaOrderStatus("t1", "123", "bad slug!")).status).toBe(400);
  });
});
