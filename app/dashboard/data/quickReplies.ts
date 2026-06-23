import type { QuickReply } from "../types";

export const quickReplies: QuickReply[] = [
  { id: "qr-tracking", shortcut: "مثال: /تتبع", text: "أرسل رقم الطلب وسأرسل لك رابط التتبع.", team: "الشحن", usage: 164 },
  { id: "qr-agent", shortcut: "مثال: /موظف", text: "تم تحويلك للموظف المختص.", team: "الدعم", usage: 88 },
  { id: "qr-invoice", shortcut: "مثال: /فاتورة", text: "أرسل رقم الطلب لإصدار الفاتورة.", team: "الفواتير", usage: 42 }
];
