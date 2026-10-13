import { describe, expect, it } from "vitest";
import { emailHtmlToText, sanitizeEmailHtml } from "../lib/email-html";

describe("sanitizeEmailHtml", () => {
  it("keeps the formatting the editor produces", () => {
    const html = '<p dir="rtl">مرحبا <b>عميلنا</b> و<i>شكرا</i></p><ul><li>أول</li><li>ثاني</li></ul><div><br></div>';
    expect(sanitizeEmailHtml(html)).toBe(html);
  });

  it("drops scripts together with their content", () => {
    const out = sanitizeEmailHtml("<p>a</p><script>alert(1)</script><p>b</p><SCRIPT src=x></SCRIPT>");
    expect(out).toBe("<p>a</p><p>b</p>");
  });

  it("drops style, iframe, object, embed and svg blocks", () => {
    const out = sanitizeEmailHtml('x<style>p{}</style><iframe src="https://evil"></iframe><object data=a></object><embed src=a><svg onload=alert(1)><circle/></svg>y');
    expect(out).toBe("xy");
  });

  it("removes event handlers and unknown attributes", () => {
    const out = sanitizeEmailHtml('<img src="https://cdn.example/a.png" onerror="alert(1)" class="x" id="y"><p onclick="a()" style="color: red; position: fixed">t</p>');
    expect(out).toBe('<img src="https://cdn.example/a.png"><p style="color: red">t</p>');
  });

  it("rejects javascript:, data: and obfuscated URL schemes", () => {
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "jav&#x61;script:alert(1)", "vbscript:x"]) {
      expect(sanitizeEmailHtml(`<a href="${href}">x</a>`)).toBe("<a>x</a>");
    }
    expect(sanitizeEmailHtml('<img src="http://insecure.example/a.png">')).toBe("<img>");
  });

  it("allows web links and adds safe link attributes", () => {
    expect(sanitizeEmailHtml('<a href="https://linklysa.io/x?a=1&b=2">go</a>')).toBe('<a href="https://linklysa.io/x?a=1&b=2" target="_blank" rel="noopener noreferrer">go</a>');
    expect(sanitizeEmailHtml('<a href="mailto:hi@example.com">m</a>')).toContain('href="mailto:hi@example.com"');
  });

  it("neutralises malformed and nested tricks", () => {
    for (const payload of [
      "<img src=x onerror=alert(1)",
      '<img src="x onerror=alert(1)>',
      "<scr<script>ipt>alert(1)</scr</script>ipt>",
      "<b/onmouseover=alert(1)>x</b>",
      '<a href="https://x.example" onclick=alert(1)>x</a>',
      "<svg/onload=alert(1)>",
      "<math><mi xlink:href=javascript:alert(1)>",
      "<!--<img src=x onerror=alert(1)>-->"
    ]) {
      const out = sanitizeEmailHtml(payload);
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);
      expect(out).not.toMatch(/javascript:/i);
    }
  });

  it("escapes a stray less-than so it cannot start a tag", () => {
    expect(sanitizeEmailHtml("a < b and <3")).toBe("a &lt; b and &lt;3");
  });

  it("is idempotent", () => {
    const once = sanitizeEmailHtml('<p style="color:red" onclick="x">hi <a href="https://a.example">l</a></p><script>1</script>');
    expect(sanitizeEmailHtml(once)).toBe(once);
  });
});

describe("emailHtmlToText", () => {
  it("returns readable text without markup or script content", () => {
    expect(emailHtmlToText("<p>مرحبا</p><script>alert(1)</script><p>بكم   <b>جميعا</b></p>")).toBe("مرحبا بكم جميعا");
  });

  it("is empty for an empty editor", () => {
    expect(emailHtmlToText("<p></p><div><br></div>")).toBe("");
  });
});
