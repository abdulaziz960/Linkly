// What an inbound WhatsApp Cloud API message shows in the inbox, and whether the bot should answer it.
//
// Some inbound messages carry no readable body: a message type the Cloud API does not deliver ("unsupported" - for example a
// verification code another platform sends to the number as a template with a copy-code button), a reaction, a contact card.
// They are stored with a clear label instead of a generic line, and they never trigger the bot's automatic reply - the sender
// is usually a platform that cannot receive a reply at all (the reply would fail as "Message undeliverable").

type Inbound = Record<string, any>;

export function describeWhatsAppMessage(message: Inbound): { text: string; conversational: boolean } {
  if (message.text?.body) return { text: message.text.body, conversational: true };
  if (message.button?.text) return { text: message.button.text, conversational: true };
  if (message.interactive?.button_reply?.title) return { text: message.interactive.button_reply.title, conversational: true };
  if (message.interactive?.list_reply?.title) return { text: message.interactive.list_reply.title, conversational: true };
  if (message.image?.caption) return { text: message.image.caption, conversational: true };
  if (message.document?.caption) return { text: message.document.caption, conversational: true };
  if (message.document?.filename) return { text: message.document.filename, conversational: true };
  if (message.document) return { text: "مستند وارد", conversational: true };
  if (message.image) return { text: "صورة واردة", conversational: true };
  if (message.audio) return { text: "رسالة صوتية واردة", conversational: true };
  if (message.video) return { text: "فيديو وارد", conversational: true };
  if (message.sticker) return { text: "ملصق وارد", conversational: true };
  if (message.location && Number.isFinite(Number(message.location.latitude)) && Number.isFinite(Number(message.location.longitude))) {
    const { latitude, longitude, name } = message.location;
    return { text: `📍 ${name ? `${name} - ` : "موقع مشارك - "}https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, conversational: true };
  }
  if (message.reaction) return { text: message.reaction.emoji ? `تفاعل ${message.reaction.emoji} على رسالة` : "أزال تفاعله على رسالة", conversational: false };
  if (Array.isArray(message.contacts) && message.contacts.length) {
    const cards = message.contacts.map((contact: Inbound) => [contact.name?.formatted_name, contact.phones?.[0]?.phone].filter(Boolean).join(" - ")).filter(Boolean);
    return { text: `جهة اتصال مشاركة: ${cards.join("، ") || "بدون تفاصيل"}`, conversational: true };
  }
  const reason = message.errors?.[0]?.title || message.errors?.[0]?.message || "";
  if (message.type === "unsupported" || message.errors?.length) {
    return {
      text: `رسالة غير مدعومة من واتساب${reason ? ` (${reason})` : ""}. غالبًا رسالة من منصة أو نشاط تجاري (مثل رمز تحقق) لا يسلّم واتساب محتواها لواجهة الأعمال، فلا يمكن عرضها هنا.`,
      conversational: false
    };
  }
  return { text: message.type ? `رسالة من نوع غير معروف (${message.type}) لا يمكن عرض محتواها` : "رسالة واردة من WhatsApp", conversational: !message.type };
}
