export const channelNames = {
  whatsapp: { ar: "واتساب", en: "WhatsApp" },
  instagram: { ar: "إنستغرام", en: "Instagram" },
  facebook: { ar: "فيسبوك", en: "Facebook" },
  telegram: { ar: "تيليجرام", en: "Telegram" },
  x: { ar: "إكس", en: "X" },
  google_maps: { ar: "خرائط جوجل", en: "Google Maps" },
  website: { ar: "الموقع الإلكتروني", en: "Website" },
  email: { ar: "البريد الإلكتروني", en: "Email" },
  gmail: { ar: "جيميل", en: "Gmail" },
  tiktok: { ar: "تيك توك", en: "TikTok" },
  sms: { ar: "الرسائل النصية", en: "SMS" }
} as const;

export type ChannelNameKey = keyof typeof channelNames;

export function getChannelName(channel: ChannelNameKey, language: "ar" | "en") {
  return channelNames[channel][language];
}
