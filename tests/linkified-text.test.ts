import { describe, expect, it } from "vitest";
import { linkifyParts, safeHref } from "../app/dashboard/components/LinkifiedText";

describe("links in conversation messages", () => {
  it("turns web addresses into links and keeps the rest as text", () => {
    expect(linkifyParts("الموقع: https://maps.app.goo.gl/2a5WoxRVNwrC1Ly9A")).toEqual([
      { text: "الموقع: " },
      { text: "https://maps.app.goo.gl/2a5WoxRVNwrC1Ly9A", href: "https://maps.app.goo.gl/2a5WoxRVNwrC1Ly9A" }
    ]);
    expect(linkifyParts("زوروا www.linklysa.io اليوم")).toEqual([
      { text: "زوروا " },
      { text: "www.linklysa.io", href: "https://www.linklysa.io/" },
      { text: " اليوم" }
    ]);
  });

  it("leaves sentence punctuation outside the link", () => {
    const parts = linkifyParts("شوف https://x.sa/a/b?c=1. وأيضًا (https://y.sa)، تمام؟");
    expect(parts.filter((part) => part.href).map((part) => part.text)).toEqual(["https://x.sa/a/b?c=1", "https://y.sa"]);
    expect(parts.map((part) => part.text).join("")).toBe("شوف https://x.sa/a/b?c=1. وأيضًا (https://y.sa)، تمام؟");
  });

  it("never links anything but http and https", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(linkifyParts("javascript:alert(1) data:text/html,x").every((part) => !part.href)).toBe(true);
    expect(linkifyParts("plain text only")).toEqual([{ text: "plain text only" }]);
  });
});
