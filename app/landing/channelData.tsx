import { channelNames } from "../channel-names";

export type Lang = "ar" | "en";
export type HubChannel = "whatsapp" | "instagram" | "facebook" | "telegram" | "email" | "tiktok";

export const HUB_CHANNELS: HubChannel[] = ["whatsapp", "instagram", "facebook", "telegram", "email", "tiktok"];

// Accent colour per channel. Glyphs stay simplified single-colour marks
// (no recreated official logos); the colour is only a recognisable accent.
export const channelColor: Record<HubChannel, string> = {
  whatsapp: "#1fae5b",
  instagram: "#d6336c",
  facebook: "#1877f2",
  telegram: "#229ed9",
  email: "#64748b",
  tiktok: "#111827"
};

export function channelLabel(channel: HubChannel, lang: Lang) {
  return channelNames[channel][lang];
}

export function ChannelGlyph({ channel, className }: { channel: HubChannel; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", "aria-hidden": true as const, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (channel === "instagram") return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
  if (channel === "email") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>;
  if (channel === "telegram") return <svg {...common}><path fill="currentColor" stroke="none" d="M21.4 3.2 18.2 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.3 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.1c.4-.4-.1-.6-.6-.2L5.8 13.7 1 12.2c-1-.3-1.1-1 .2-1.5L20 3.4c.9-.3 1.7.2 1.4-.2Z" /></svg>;
  if (channel === "tiktok") return <svg {...common}><path fill="currentColor" stroke="none" d="M15.2 3c.4 2.3 1.7 3.7 3.8 4.1v3.2a9 9 0 0 1-3.8-1.2v6.1a5.8 5.8 0 1 1-5-5.7v3.3a2.6 2.6 0 1 0 1.8 2.5V3h3.2Z" /></svg>;
  if (channel === "facebook") return <svg {...common}><path fill="currentColor" stroke="none" d="M13.6 21v-7.3h2.5l.4-3h-2.9V8.8c0-.9.3-1.5 1.5-1.5h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.2v3h2.5V21h2.9Z" /></svg>;
  return <svg {...common}><path d="M20 11.7a8 8 0 0 1-11.8 7l-4.2 1.1 1.1-4.1A8 8 0 1 1 20 11.7Z" /><path d="M9 8.5c.3 2.8 2 4.6 4.8 5.5.5.1 1.3-.8 1.5-1.2" /></svg>;
}

export type SampleMessage = { customer: string; initial: string; text: string; employee: string; team: string };

// Illustrative demo data only - every name and message here is fictional.
export const sampleMessages: Record<Lang, Record<HubChannel, SampleMessage>> = {
  ar: {
    whatsapp: { customer: "وليد السبيعي", initial: "و", text: "السلام عليكم، هل المنتج متوفر اليوم؟", employee: "سارة", team: "فريق المبيعات" },
    instagram: { customer: "نورة أحمد", initial: "ن", text: "وصلتني رسالتكم من الإعلان، وش العرض؟", employee: "ريان", team: "خدمة العملاء" },
    facebook: { customer: "عبدالله الحربي", initial: "ع", text: "كم مدة التوصيل للرياض؟", employee: "فهد", team: "الدعم الفني" },
    telegram: { customer: "محمد علي", initial: "م", text: "أحتاج مساعدة في الطلب رقم 2041", employee: "فهد", team: "الدعم الفني" },
    email: { customer: "شركة سمارت", initial: "س", text: "نحتاج عرض سعر لفريق من 12 موظف", employee: "سارة", team: "فريق المبيعات" },
    tiktok: { customer: "ريم خالد", initial: "ر", text: "شفت الفيديو، كيف أطلب؟", employee: "ريان", team: "خدمة العملاء" }
  },
  en: {
    whatsapp: { customer: "Waleed Alsubaie", initial: "W", text: "Hi, is the product available today?", employee: "Sara", team: "Sales team" },
    instagram: { customer: "Noura Ahmed", initial: "N", text: "I saw your ad. What is the offer?", employee: "Rayan", team: "Customer care" },
    facebook: { customer: "Abdullah Alharbi", initial: "A", text: "How long is delivery to Riyadh?", employee: "Fahad", team: "Support" },
    telegram: { customer: "Mohammed Ali", initial: "M", text: "I need help with order #2041", employee: "Fahad", team: "Support" },
    email: { customer: "Smart Co.", initial: "S", text: "We need a quote for a 12-person team", employee: "Sara", team: "Sales team" },
    tiktok: { customer: "Reem Khaled", initial: "R", text: "Saw the video. How do I order?", employee: "Rayan", team: "Customer care" }
  }
};
