import type { MessageTemplate } from "../types";

export const templates: MessageTemplate[] = [
  {
    name: "welcome",
    message: "مرحبا {{1}}، سعداء بتواصلك معنا. كيف نقدر نخدمك اليوم؟",
    type: "خدمة",
    category: "UTILITY",
    language: "ar",
    status: "معتمد",
    lastUsed: "اليوم"
  },
  {
    name: "order_confirmation",
    message: "تم تأكيد طلبك رقم {{1}}، وسيتم إشعارك عند خروجه للتوصيل.",
    type: "خدمة",
    category: "UTILITY",
    language: "ar",
    status: "معتمد",
    lastUsed: "أمس"
  },
  {
    name: "marketing_offer",
    message: "عرض خاص لك: احصل على {{1}} عند إتمام الطلب قبل نهاية اليوم.",
    type: "تسويق",
    category: "MARKETING",
    language: "ar",
    status: "قيد المراجعة",
    buttonType: "URL",
    buttonText: "مشاهدة العرض",
    buttonUrl: "https://example.com/offers",
    lastUsed: "-"
  }
];
