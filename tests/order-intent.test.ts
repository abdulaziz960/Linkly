import { describe, expect, it } from "vitest";
import { detectOrderIntent } from "../lib/order-intent";

describe("order intent detection", () => {
  it("detects cancellation", () => {
    expect(detectOrderIntent("ابغى الغي طلبي")).toBe("cancel");
    expect(detectOrderIntent("إلغاء الطلب رقم 202501")).toBe("cancel");
    expect(detectOrderIntent("كنسل الطلب لو سمحت")).toBe("cancel");
    expect(detectOrderIntent("الغاء 202501")).toBe("cancel");
    expect(detectOrderIntent("I want to cancel my order")).toBe("cancel");
  });

  it("detects modification", () => {
    expect(detectOrderIntent("ابي اعدل طلبي")).toBe("modify");
    expect(detectOrderIntent("ممكن تغيير العنوان")).toBe("modify");
    expect(detectOrderIntent("اغير المنتج في الطلب")).toBe("modify");
  });

  it("detects returns and exchanges", () => {
    expect(detectOrderIntent("ابغى ارجاع المنتج")).toBe("return");
    expect(detectOrderIntent("استبدال الطلب")).toBe("return");
    expect(detectOrderIntent("ابي استرجاع فلوسي")).toBe("return");
  });

  it("does not trigger on ordinary messages", () => {
    expect(detectOrderIntent("وين طلبي")).toBeNull();
    expect(detectOrderIntent("السلام عليكم")).toBeNull();
    expect(detectOrderIntent("كم سعر المنتج")).toBeNull();
    expect(detectOrderIntent("غير متوفر عندكم؟")).toBeNull();
    expect(detectOrderIntent("")).toBeNull();
    expect(detectOrderIntent("الغاء ".repeat(80))).toBeNull();
  });

  it("cancellation wins over other intents", () => {
    expect(detectOrderIntent("الغي الطلب وارجع الفلوس")).toBe("cancel");
  });
});
