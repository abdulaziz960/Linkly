import { describe, expect, it } from "vitest";

describe("bot message variables", () => {
  it("renders customer placeholders before sending replies", async () => {
    const { renderBotVariables } = await import("../lib/bot-engine");

    expect(renderBotVariables("أهلاً وسهلاً {{name}}، رقمك {{phone}}", { customerName: "عبدالعزيز", customerPhone: "966500000000" }))
      .toBe("أهلاً وسهلاً عبدالعزيز، رقمك 966500000000");
    expect(renderBotVariables("مرحباً {{ customer.name }}", { customerName: "عميل 1234", customerPhone: "1234" }))
      .toBe("مرحباً عميلنا");
    expect(renderBotVariables("حياك {{اسم_العميل}}", { customerName: "سارة" }))
      .toBe("حياك سارة");
  });
});
