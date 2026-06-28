import type { Conversation } from "../types";

export const initialConversations: Conversation[] = [
  {
    id: "c-1",
    customer: "سارة العتيبي",
    phone: "+966501234567",
    initial: "س",
    lastMessage: "أبغى أعرف حالة طلبي",
    status: "assigned",
    assignee: "عبدالعزيز الكيالي",
    unread: 2,
    tags: ["VIP", "شحن"],
    messages: [
      { id: "m-1", direction: "in", text: "السلام عليكم، أبغى أعرف وين وصل طلبي؟", time: "10:21 ص" },
      { id: "m-2", direction: "out", text: "وعليكم السلام سارة، طلبك خرج مع شركة الشحن وهذا رابط التتبع.", time: "10:22 ص" },
      { id: "m-3", direction: "in", text: "ممتاز، هل يقدر يوصل اليوم؟", time: "10:24 ص" }
    ]
  },
  {
    id: "c-2",
    customer: "عبدالله الحربي",
    phone: "+966502345678",
    initial: "ع",
    lastMessage: "هل العرض ما زال متاح؟",
    status: "unassigned",
    assignee: "بدون موظف",
    windowExpired: true,
    tags: ["متابعة لاحقة"],
    messages: [{ id: "m-4", direction: "in", text: "هل العرض ما زال متاح؟", time: "أمس 8:12 م" }]
  },
  {
    id: "c-3",
    customer: "نورة القحطاني",
    phone: "+966503456789",
    initial: "ن",
    lastMessage: "تم تحويل الطلب لقسم الشحن",
    status: "assigned",
    assignee: "نورة القحطاني",
    windowExpired: true,
    tags: ["شحن", "شكوى"],
    messages: [{ id: "m-5", direction: "in", text: "تم تحويل الطلب لقسم الشحن", time: "قبل يومين" }]
  },
  {
    id: "c-4",
    customer: "محمد المالكي",
    phone: "+966504567890",
    initial: "م",
    lastMessage: "أحتاج فاتورة الطلب",
    status: "assigned",
    assignee: "سارة الحربي",
    unread: 1,
    tags: ["دفع"],
    messages: [{ id: "m-6", direction: "in", text: "أحتاج فاتورة الطلب", time: "قبل 3 ساعات" }]
  }
];
