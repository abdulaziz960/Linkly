import { describe, expect, it } from "vitest";
import { parsePastedUnits } from "../lib/units-paste";

describe("pasted unit tables", () => {
  it("reads an Excel paste (tabs) by its header row, in any column order", () => {
    const text = ["حالة الوحدة\tالوحدة\tالسعر\tالمساحة\tوصف الوحدة", "محجوز\tA9\t950000\t270\tدور أرضي", "متاح\tA2\t1,080,000\t395.08 م²\tبنت هاوس", "مباعة\tC4\tفيلا العرض\t487.72\tفيلا"].join("\n");
    const { units, skipped } = parsePastedUnits(text);
    expect(skipped).toBe(0);
    expect(units).toEqual([
      { name: "A9", kind: "دور أرضي", model: "", area: "270 م²", priceText: "950,000 ر.س", status: "reserved" },
      { name: "A2", kind: "بنت هاوس", model: "", area: "395.08 م²", priceText: "1,080,000 ر.س", status: "available" },
      { name: "C4", kind: "فيلا", model: "", area: "487.72 م²", priceText: "فيلا العرض", status: "sold" }
    ]);
  });

  it("reads Arabic-Indic digits and a markdown/pipe table, and skips empty or duplicate names", () => {
    const text = ["| الوحدة | المساحة | السعر | الحالة |", "|---|---|---|---|", "| B١ | ٢٧٠ | ٩٥٠٠٠٠ | متاح |", "| B1 | 1 | 1 | متاح |", "|  | 5 | 5 | متاح |"].join("\n");
    const { units, skipped } = parsePastedUnits(text);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ name: "B1", area: "270 م²", priceText: "950,000 ر.س", status: "available" });
    expect(skipped).toBe(2);
  });

  it("without a header uses the form's order: unit, area, price, description, status", () => {
    const { units } = parsePastedUnits("A1\t270\t950000\tدور أرضي\tمحجوز");
    expect(units[0]).toEqual({ name: "A1", kind: "دور أرضي", model: "", area: "270 م²", priceText: "950,000 ر.س", status: "reserved" });
  });

  it("gives nothing for text that is not a table", () => {
    expect(parsePastedUnits("").units).toEqual([]);
    expect(parsePastedUnits("   \n  ").units).toEqual([]);
  });
});
