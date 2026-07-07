import type { QuickReply } from "../types";

export const quickReplies: QuickReply[] = [
  { id: "qr-address", shortcut: "/address", text: "موقعنا على خرائط Google: {{link}}", team: "الدعم", usage: 42 },
  { id: "qr-hours", shortcut: "/hours", text: "ساعات العمل من 9 صباحا إلى 6 مساء من الأحد إلى الخميس.", team: "الدعم", usage: 38 },
  { id: "qr-payment", shortcut: "/payment", text: "تقدر تسدد عبر الرابط التالي: {{payment_link}}", team: "المبيعات", usage: 27 }
];
