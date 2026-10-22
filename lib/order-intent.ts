export type OrderIntent = "cancel" | "modify" | "return";

export const ORDER_INTENTS: OrderIntent[] = ["cancel", "modify", "return"];

/** Replies sent when the customer asks to cancel, change or return an order. {{order}} is the order number, or "طلبك". */
export const DEFAULT_INTENT_TEXTS: Record<OrderIntent, string> = {
  cancel: "استلمنا طلب إلغاء {{order}}. سيراجعه أحد موظفينا ويتواصل معك قريبًا للتأكيد، علمًا أن الإلغاء يعتمد على حالة الطلب.",
  modify: "استلمنا طلب تعديل {{order}}. سيتواصل معك أحد موظفينا قريبًا، ويفضّل إرسال التعديل المطلوب (العنوان أو المنتج) في رسالة واحدة.",
  return: "استلمنا طلبك بخصوص إرجاع أو استبدال {{order}}. سيتواصل معك أحد موظفينا قريبًا لإكمال الإجراء."
};

/** The tag put on the conversation so the team can filter these requests. */
export const INTENT_TAGS: Record<OrderIntent, string> = {
  cancel: "طلب إلغاء",
  modify: "طلب تعديل",
  return: "طلب إرجاع"
};

export const INTENT_NOTE_LABEL: Record<OrderIntent, string> = {
  cancel: "إلغاء",
  modify: "تعديل",
  return: "إرجاع أو استبدال"
};

function normalize(text: string): string {
  return text
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .toLowerCase();
}

const ORDER_CONTEXT = /(طلب|اوردر|مشتريات|order|purchase)/;
const CANCEL_WORDS = /(الغاء|الغي|الغيه|الغو|كنسل|cancel)/;
const RETURN_WORDS = /(ارجاع|ارجع|استرجاع|استرجع|استبدال|استبدل|مرتجع|ريتيرن|refund|return|exchange)/;
const RETURN_CONTEXT = /(طلب|منتج|المنتج|فلوسي|مبلغ|المبلغ|فاتوره|اوردر|order|item)/;
const MODIFY_WORDS = /(تعديل|اعدل|عدل|عدلو|تغيير|اغير|غيرو|ابدل|تبديل|اضيف|اضافه|احذف|حذف|edit|change|modify)/;
const MODIFY_CONTEXT = /(طلب|عنوان|العنوان|توصيل|منتج|المنتج|اوردر|مشتريات|order|address)/;

/** Pure: whether a customer message asks to cancel, change or return an order (short messages only). */
export function detectOrderIntent(text: string): OrderIntent | null {
  const value = normalize(text.trim());
  if (!value || value.length > 300) return null;
  if (CANCEL_WORDS.test(value) && (ORDER_CONTEXT.test(value) || /(?<![\d+])\d{4,12}(?!\d)/.test(value))) return "cancel";
  if (RETURN_WORDS.test(value) && RETURN_CONTEXT.test(value)) return "return";
  if (MODIFY_WORDS.test(value) && MODIFY_CONTEXT.test(value)) return "modify";
  return null;
}
