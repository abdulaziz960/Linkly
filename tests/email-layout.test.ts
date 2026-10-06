import { describe, expect, it } from "vitest";
import { EMAIL_LOGO_URL, renderEmail } from "../lib/email-layout";

const linkly = { name: "Linkly", color: "#178a82" };

describe("renderEmail", () => {
  it("sets right-to-left on the document, the wrapper tables and every text cell (Gmail drops dir on html/body)", () => {
    const html = renderEmail({ brand: linkly, heading: "إعادة تعيين كلمة السر", greetingName: "عمر", paragraphs: ["نص"], button: { label: "زر", url: "https://linklysa.io/x" } });
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('<body dir="rtl"');
    const cells = html.match(/<td /g)?.length ?? 0;
    const rtlCells = html.match(/<td [^>]*dir="rtl"/g)?.length ?? 0;
    expect(cells).toBeGreaterThan(5);
    expect(rtlCells).toBe(cells - 1); // every cell but the thin accent bar
    expect(html).toContain("direction:rtl;text-align:right");
  });

  it("shows the hosted Linkly logo for Linkly and the workspace name for a white-label brand", () => {
    expect(renderEmail({ brand: linkly, heading: "x" })).toContain(`src="${EMAIL_LOGO_URL}"`);
    const branded = renderEmail({ brand: { name: "شركة الأمل", color: "#6d3fd0" }, heading: "x" });
    expect(branded).not.toContain(EMAIL_LOGO_URL);
    expect(branded).toContain("شركة الأمل");
    expect(branded).toContain("#6d3fd0");
  });

  it("escapes everything it prints", () => {
    const html = renderEmail({ brand: { name: "<b>x</b>", color: "#178a82" }, heading: "<script>alert(1)</script>", greetingName: "<img src=x onerror=alert(1)>", paragraphs: ['"><svg onload=alert(1)>'], rows: [["<a>", "<i>"]], body: "<u>", note: "<s>", button: { label: "<em>", url: 'https://x.test/?a="><script>' } });
    expect(html).not.toMatch(/<script>alert|<img src=x|<svg onload|<b>x<\/b>/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a one-time code left-to-right, and the fallback link only when asked", () => {
    const withCode = renderEmail({ brand: linkly, heading: "x", code: "123456" });
    expect(withCode).toMatch(/dir="ltr"[^>]*>123456</);
    expect(renderEmail({ brand: linkly, heading: "x", button: { label: "b", url: "https://x.test" } })).not.toContain("انسخ الرابط");
    expect(renderEmail({ brand: linkly, heading: "x", button: { label: "b", url: "https://x.test" }, fallbackLink: true })).toContain("انسخ الرابط");
  });

  it("uses a red accent for a danger email", () => {
    expect(renderEmail({ brand: linkly, heading: "x", tone: "danger", button: { label: "b", url: "https://x.test" } })).toContain("#b42318");
  });
});
