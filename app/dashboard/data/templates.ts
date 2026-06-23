import type { MessageTemplate } from "../types";

export const templates: MessageTemplate[] = [
  {
    name: "order_confirmation",
    message: "تم تأكيد طلبك، وسيتم إرسال تفاصيل الشحن قريبًا.",
    type: "خدمة",
    language: "ar",
    status: "معتمد",
    lastUsed: "اليوم"
  },
  {
    name: "shipping_update",
    message: "تم تحديث حالة الشحنة، يمكنك متابعة الطلب من رابط التتبع.",
    type: "خدمة",
    language: "ar",
    status: "معتمد",
    lastUsed: "أمس"
  },
  {
    name: "welcome",
    message: "السلام عليكم ورحمة الله وبركاته\nالرجاء الرد على الرسالة لخدمتكم",
    type: "تسويق",
    language: "ar",
    status: "معتمد",
    lastUsed: "اليوم"
  },
  {
    name: "weekend_offer",
    message: "لدينا عرض نهاية الأسبوع، يسعدنا خدمتك عند الرد على الرسالة.",
    type: "تسويق",
    language: "ar",
    status: "قيد المراجعة",
    lastUsed: "-"
  },
  {
    name: "marketing_offer",
    message: "لدينا عرض جديد يناسب اهتمامك. يسعدنا خدمتك عند الرد على الرسالة.",
    type: "تسويق",
    language: "ar",
    status: "معتمد",
    lastUsed: "قبل أسبوع"
  }
];
