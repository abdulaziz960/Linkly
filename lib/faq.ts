// Single source of truth for the FAQ shown on the landing pages and /faq.
export const faqsAr = [
  ["هل أقدر أستخدم أكثر من موظف؟", "نعم. أضف الموظفين وحدد أدوارهم وفرقهم وصلاحياتهم من لوحة واحدة."],
  ["هل أقدر أربط رقم واتساب الحالي؟", "يعتمد على حالة الرقم ومتطلبات واجهة واتساب السحابية لدى ميتا، ونساعدك في مراجعة مسار الربط."],
  ["هل أحتاج رقم واتساب جديد؟", "ليس دائمًا. نراجع وضع رقمك الحالي أولًا ثم نحدد أفضل مسار."],
  ["هل تدعمون واجهة واتساب للأعمال؟", "نعم، الربط التشغيلي مبني على واجهة واتساب السحابية الرسمية."],
  ["هل توجد واجهة برمجة؟", "تتوفر واجهة برمجة API وWebhooks للمطورين ضمن باقة المؤسسات الكبيرة فأعلى."],
  ["هل أقدر ألغي الاشتراك؟", "يمكن جدولة الإلغاء لنهاية الفترة الحالية من شاشة الفوترة."],
  ["هل يوجد رسم تجهيز؟", "خدمة تجهيز حسابات ميتا والربط الكامل اختيارية وتكلف 500 ريال مرة واحدة."],
  ["كيف تُحتسب رسوم واتساب؟", "رسوم رسائل واتساب الرسمية من ميتا، إن وجدت، منفصلة عن اشتراك Linkly."],
  ["هل بيانات العملاء آمنة؟", "تستخدم المنصة صلاحيات مستخدمين، وتشفيرًا لأسرار التكاملات، وجلسات محددة المدة، وسجلات تشغيل للمساعدة في تتبع النشاط."]
] as const;

export const faqsEn = [
  ["Can I use more than one employee?", "Yes. Add employees and set their roles, teams and permissions from one dashboard."],
  ["Can I connect my existing WhatsApp number?", "It depends on the number's status and Meta's WhatsApp Cloud API requirements — we help you review the connection path."],
  ["Do I need a new WhatsApp number?", "Not always. We review your current number's status first, then decide the best path."],
  ["Do you support the WhatsApp Business API?", "Yes, the operational connection is built on Meta's official WhatsApp Cloud API."],
  ["Is there an API?", "A developer API and webhooks are available from the Large Enterprises plan and up."],
  ["Can I cancel my subscription?", "Cancellation can be scheduled for the end of the current period from the billing screen."],
  ["Is there a setup fee?", "Setting up Meta accounts and the full connection is optional and costs SAR 500 one time."],
  ["How are WhatsApp fees calculated?", "Official WhatsApp message fees from Meta, if any, are separate from the Linkly subscription."],
  ["Is customer data safe?", "The platform uses user permissions, encryption for integration secrets, time-limited sessions, and activity logs to help track activity."]
] as const;
