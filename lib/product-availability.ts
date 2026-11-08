/** Public product availability, shared by landing demos and plan comparison. */
export const PENDING_MESSAGING_CHANNELS = ["tiktok"] as const;
export function isMessagingPending(channel: string) {
  return PENDING_MESSAGING_CHANNELS.some((pending) => pending === channel);
}

export const STORE_INTEGRATION_SUMMARY = {
  ar: "تكامل سلة وزد لمتابعة الطلبات والسلات المتروكة وإرسال إشعارات واتساب. ربط سلة متاح في جميع الباقات، ويتطلب ربط زد باقة المؤسسات الكبيرة فأعلى وتفعيل الربط. كتالوج المنتجات والشراء من واتساب يبدأ من باقة المؤسسات الكبيرة. شوبيفاي قريبًا.",
  en: "Salla and Zid integrations cover orders, abandoned carts and WhatsApp notifications. Salla is available on every plan. Zid requires Large Enterprises or above and an enabled connection. The product catalog and buying on WhatsApp start on Large Enterprises. Shopify is coming soon."
};
