export type SuggestedOrderEvent = "created" | "processing" | "shipped" | "delivered" | "cancelled";

/** Order sends always fill {{1}} name, {{2}} order number, {{3}} status, {{4}} tracking link (see store-engine). */
export const ORDER_TEMPLATE_EXAMPLES = { "1": "محمد", "2": "10025", "3": "تم الشحن", "4": "https://example.com/track" };

const SUGGESTED_MESSAGES: Record<SuggestedOrderEvent, string> = {
  created: "أهلًا {{1}}، وصلنا طلبك رقم {{2}} وحالته الآن: {{3}}. شكرًا لثقتك بنا، وتقدر تتابع طلبك من هنا: {{4}} ونحن بخدمتك دائمًا.",
  processing: "مرحبًا {{1}}، طلبك رقم {{2}} صار {{3}}، ونجهزه لك الآن بكل عناية. تابع آخر التحديثات من هنا: {{4}} ونشكرك على صبرك.",
  shipped: "أبشر {{1}}، طلبك رقم {{2}} صار {{3}} وفي طريقه إليك. تقدر تتبع الشحنة من هنا: {{4}} وبإذن الله يوصلك قريبًا.",
  delivered: "أهلًا {{1}}، طلبك رقم {{2}} صار {{3}}. نتمنى أن ينال إعجابك، وتفاصيل الطلب هنا: {{4}} وإذا احتجت أي مساعدة لا تتردد بالتواصل معنا.",
  cancelled: "مرحبًا {{1}}، نفيدك أن طلبك رقم {{2}} صار {{3}}. للاطلاع على التفاصيل: {{4}} وإذا كان عندك أي استفسار فنحن جاهزون لخدمتك."
};

export function suggestedOrderMessage(event: SuggestedOrderEvent): string {
  return SUGGESTED_MESSAGES[event];
}

export function suggestedOrderTemplateName(store: string, event: SuggestedOrderEvent): string {
  return `${store}_order_${event}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

/** Meta rejects bodies that start/end with a variable or have fewer than all four we always send; returns an Arabic problem or "". */
export function orderMessageProblem(message: string): string {
  const text = message.trim();
  if (!text) return "نص القالب مطلوب";
  const found = new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => match[1]));
  for (const index of ["1", "2", "3", "4"]) {
    if (!found.has(index)) return `يجب أن يحتوي النص على {{${index}}} لأن المتجر يرسل المتغيرات الأربعة دائمًا.`;
  }
  if (found.size > 4) return "المتغيرات المسموحة من {{1}} إلى {{4}} فقط.";
  if (/^\{\{\d+\}\}/.test(text) || /\{\{\d+\}\}$/.test(text)) return "لا يقبل Meta أن يبدأ النص أو ينتهي بمتغير. أضف كلمة قبله أو بعده.";
  if (text.length > 1000) return "النص طويل جدًا (الحد 1000 حرف).";
  return "";
}

/** Cart reminders send {{1}} name, {{2}} cart total, {{3}} checkout link, {{4}} discount code (only meaningful on the last reminder). */
export const CART_TEMPLATE_EXAMPLES = { "1": "محمد", "2": "250", "3": "https://example.com/cart", "4": "SAVE10" };

export type CartReminderStep = 1 | 2 | 3;

/** The last reminder may carry the discount code; earlier ones never use {{4}} since the code is empty there. */
export function suggestedCartMessage(step: CartReminderStep, isLast: boolean, withDiscount: boolean): string {
  if (isLast && withDiscount) {
    return "مرحبًا {{1}}، هذا آخر تذكير لسلتك بقيمة {{2}} ريال. استخدم كود الخصم {{4}} عند إكمال طلبك من هنا: {{3}} ونتشرف بخدمتك.";
  }
  if (step === 1) return "أهلًا {{1}}، لاحظنا أنك تركت سلتك بقيمة {{2}} ريال في متجرنا. تقدر تكمل طلبك بسهولة من هنا: {{3}} ونحن جاهزون لخدمتك.";
  if (step === 2) return "مرحبًا {{1}}، سلتك بقيمة {{2}} ريال ما زالت بانتظارك والكميات قد تنفد. أكمل طلبك من هنا: {{3}} وإذا احتجت أي مساعدة تواصل معنا.";
  return "أهلًا {{1}}، هذا تذكير أخير بسلتك بقيمة {{2}} ريال. أكمل طلبك من هنا: {{3}} ونسعد بخدمتك دائمًا.";
}

export function suggestedCartTemplateName(store: string, step: CartReminderStep, withDiscount: boolean): string {
  return `${store}_cart_${step}${withDiscount ? "_discount" : ""}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

/** Cart messages need {{1}}-{{3}}; {{4}} (discount code) is optional. Returns an Arabic problem or "". */
export function cartMessageProblem(message: string): string {
  const text = message.trim();
  if (!text) return "نص القالب مطلوب";
  const found = new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => match[1]));
  for (const index of ["1", "2", "3"]) {
    if (!found.has(index)) return `يجب أن يحتوي النص على {{${index}}}.`;
  }
  if ([...found].some((index) => Number(index) > 4)) return "المتغيرات المسموحة من {{1}} إلى {{4}} فقط.";
  if (/^\{\{\d+\}\}/.test(text) || /\{\{\d+\}\}$/.test(text)) return "لا يقبل Meta أن يبدأ النص أو ينتهي بمتغير. أضف كلمة قبله أو بعده.";
  if (text.length > 1000) return "النص طويل جدًا (الحد 1000 حرف).";
  return "";
}
