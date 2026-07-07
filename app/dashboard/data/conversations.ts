import type { Conversation } from "../types";

export const initialConversations: Conversation[] = [
  {
    id: "c-1",
    customer: "سارة العتيبي",
    phone: "+966 50 123 4567",
    initial: "س",
    lastMessage: "احتاج اعرف متى يوصل الطلب؟",
    status: "assigned",
    assignee: "نورة القحطاني",
    unread: 2,
    tags: ["طلب قائم", "شحن"],
    messages: [
      { id: "m-1", direction: "in", text: "السلام عليكم، احتاج اعرف متى يوصل الطلب؟", time: "10:18" },
      { id: "m-2", direction: "out", text: "وعليكم السلام سارة، أشيك لك على حالة الشحنة الآن.", time: "10:20", author: "نورة القحطاني" }
    ]
  },
  {
    id: "c-2",
    customer: "محمد الحربي",
    phone: "+966 55 888 1200",
    initial: "م",
    lastMessage: "هل العرض يشمل التركيب؟",
    status: "unassigned",
    assignee: "بدون موظف",
    unread: 1,
    tags: ["عميل محتمل", "عرض سعر"],
    messages: [
      { id: "m-3", direction: "in", text: "هل العرض يشمل التركيب؟", time: "09:44" }
    ]
  },
  {
    id: "c-3",
    customer: "متجر لمسة",
    phone: "+966 53 420 9090",
    initial: "ل",
    lastMessage: "تم اعتماد قالب الرسالة",
    status: "closed",
    assignee: "عبدالعزيز الكيالي",
    tags: ["قوالب", "منجز"],
    messages: [
      { id: "m-4", direction: "in", text: "نحتاج قالب ترحيبي للحملة الجديدة.", time: "أمس" },
      { id: "m-5", direction: "out", text: "تم اعتماد قالب الرسالة وتقدرون تستخدمونه الآن.", time: "أمس", author: "عبدالعزيز الكيالي" }
    ]
  },
  {
    id: "c-4",
    customer: "عبدالله السالم",
    phone: "+966 56 310 4400",
    initial: "ع",
    lastMessage: "شكرا لكم",
    status: "assigned",
    assignee: "نورة القحطاني",
    windowExpired: true,
    tags: ["متابعة"],
    messages: [
      { id: "m-6", direction: "in", text: "شكرا لكم", time: "الأحد" },
      { id: "m-7", direction: "note", text: "نافذة 24 ساعة انتهت، استخدم قالب متابعة.", time: "الأحد", author: "النظام" }
    ]
  }
];
