import { describe, expect, it } from "vitest";
import { parseBranchFile, parseCsv } from "../app/dashboard/branch-import";

describe("branch import file", () => {
  it("reads quoted fields, semicolons and a BOM", () => {
    expect(parseCsv('﻿a,b\n"x, y","he said ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
    expect(parseCsv("a;b\n1;2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("maps Arabic or English headers to branch fields and skips empty rows", async () => {
    const csv = "اسم الفرع,العنوان,رقم الفرع,ساعات الدوام,رابط الخريطة\nفرع الرياض,العليا,0500000000,9-11,https://maps.app.goo.gl/x\n,,,,\n";
    const file = { name: "branches.csv", text: async () => csv } as unknown as File;
    expect(await parseBranchFile(file)).toEqual([{ name: "فرع الرياض", address: "العليا", phone: "0500000000", workingHours: "9-11", mapUrl: "https://maps.app.goo.gl/x" }]);
    const en = { name: "b.csv", text: async () => "Branch name,Address\nOlaya,Riyadh\n" } as unknown as File;
    expect((await parseBranchFile(en))[0]).toMatchObject({ name: "Olaya", address: "Riyadh" });
  });

  it("returns nothing when the name column is missing", async () => {
    const file = { name: "x.csv", text: async () => "foo,bar\n1,2\n" } as unknown as File;
    expect(await parseBranchFile(file)).toEqual([]);
  });
});
