import { describe, expect, it } from "vitest";
import { describeWhatsAppMessage } from "../lib/whatsapp-inbound-text";

describe("what an inbound WhatsApp message shows", () => {
  it("keeps the readable ones as they were, and lets the bot answer them", () => {
    expect(describeWhatsAppMessage({ type: "text", text: { body: "مرحبا" } })).toEqual({ text: "مرحبا", conversational: true });
    expect(describeWhatsAppMessage({ type: "image", image: { id: "1" } })).toEqual({ text: "صورة واردة", conversational: true });
    expect(describeWhatsAppMessage({ type: "interactive", interactive: { list_reply: { title: "برجر" } } }).text).toBe("برجر");
    expect(describeWhatsAppMessage({ type: "location", location: { latitude: 24.7, longitude: 46.6, name: "الرياض" } }).text).toContain("query=24.7,46.6");
  });

  it("labels a message type the Cloud API does not deliver (a platform's verification code) and keeps the bot out of it", () => {
    const result = describeWhatsAppMessage({ type: "unsupported", errors: [{ code: 131051, title: "Message type is not supported" }] });
    expect(result.conversational).toBe(false);
    expect(result.text).toContain("رسالة غير مدعومة من واتساب");
    expect(result.text).toContain("Message type is not supported");
    expect(result.text).toContain("رمز تحقق");
  });

  it("shows reactions and contact cards instead of a generic line", () => {
    expect(describeWhatsAppMessage({ type: "reaction", reaction: { emoji: "👍", message_id: "x" } })).toEqual({ text: "تفاعل 👍 على رسالة", conversational: false });
    expect(describeWhatsAppMessage({ type: "contacts", contacts: [{ name: { formatted_name: "سارة" }, phones: [{ phone: "+966500000000" }] }] })).toEqual({ text: "جهة اتصال مشاركة: سارة - +966500000000", conversational: true });
  });

  it("names an unknown type instead of the generic line", () => {
    expect(describeWhatsAppMessage({ type: "order" })).toEqual({ text: "رسالة من نوع غير معروف (order) لا يمكن عرض محتواها", conversational: false });
  });
});
