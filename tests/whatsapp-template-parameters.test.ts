import { describe, expect, it } from "vitest";
import { templateParameters } from "../lib/whatsapp-send";

describe("templateParameters", () => {
  it("builds positional parameters for {{1}}, {{2}} style templates", () => {
    const params = templateParameters("مرحبا {{1}}, طلبك رقم {{2}} جاهز", "أحمد");
    expect(params).toEqual([
      { type: "text", text: "أحمد" },
      { type: "text", text: "أحمد" }
    ]);
  });

  it("builds named parameters with parameter_name for {{customer_name}} style templates", () => {
    const params = templateParameters("مرحبا {{customer_name}}, طلبك {{order_number}} جاهز", "أحمد");
    expect(params).toEqual([
      { type: "text", parameter_name: "customer_name", text: "أحمد" },
      { type: "text", parameter_name: "order_number", text: "أحمد" }
    ]);
  });

  it("returns undefined for a template with no variables", () => {
    expect(templateParameters("مرحبا، شكراً لتواصلكم معنا", "أحمد")).toBeUndefined();
  });
});
