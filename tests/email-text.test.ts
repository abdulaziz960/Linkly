import { describe, expect, it } from "vitest";
import { emailBodyToText } from "../lib/email-text";

describe("emailBodyToText", () => {
  it("drops the CSS that leaked into a text body, keeps the message and decodes entities", () => {
    const leaked = `96 td,th,div,p,a,h1,h2,h3,h4,h5,h6 {font-family: "Segoe UI", Tahoma, sans-serif; mso-line-height-rule: exactly;} a { color: #004956; } /* The framed card is 720px */ @media (max-width: 720px) { .sm-w-full { width: 100% !important; } } @media (max-width: 480px) { .sm-block { display: table !important; margin: 6px auto !important; } } استخدم هذا الرمز لإكمال تسجيل الدخول 7888 &zwnj; الرمز صالح لمدة 5 دقائق`;
    const text = emailBodyToText(leaked);
    expect(text).not.toMatch(/font-family|@media|!important|\{|\}/);
    expect(text).toContain("استخدم هذا الرمز لإكمال تسجيل الدخول 7888");
    expect(text).toContain("الرمز صالح لمدة 5 دقائق");
    expect(text).not.toContain("&zwnj;");
  });

  it("turns an HTML email into readable lines without its <style> block", () => {
    const html = `<html><head><title>Hi</title><style>p{color:red}</style></head><body><!-- x --><div>مرحباً&nbsp;سارة</div><p>رقم طلبك <b>#100245</b></p><table><tr><td>المنتج</td><td>ساعة &amp; سوار</td></tr></table><script>alert(1)</script></body></html>`;
    const text = emailBodyToText(html);
    expect(text).toBe("مرحباً سارة\nرقم طلبك #100245\nالمنتج ساعة & سوار");
  });

  it("leaves a plain message alone and handles empty input", () => {
    expect(emailBodyToText("السلام عليكم\n\n\n\nكيف حالكم؟")).toBe("السلام عليكم\n\nكيف حالكم؟");
    expect(emailBodyToText("")).toBe("");
    expect(emailBodyToText(undefined)).toBe("");
    expect(emailBodyToText("إذا كان 3 < 5 فهذا صحيح")).toBe("إذا كان 3 < 5 فهذا صحيح");
  });
});
