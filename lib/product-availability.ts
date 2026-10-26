/** Public product availability, shared by landing demos and plan comparison. */
export const PENDING_MESSAGING_CHANNELS = ["tiktok"] as const;
export function isMessagingPending(channel: string) {
  return PENDING_MESSAGING_CHANNELS.some((pending) => pending === channel);
}

export const STORE_INTEGRATION_SUMMARY = {
  ar: "ربط سلة للطلبات والسلات المتروكة وإشعارات واتساب متاح في جميع الباقات. كتالوج المنتجات والشراء من واتساب يبدأ من باقة المؤسسات الكبيرة. زد وشوبيفاي قريبًا.",
  en: "Salla orders, abandoned carts and WhatsApp updates are available on every plan. The product catalog and buying on WhatsApp start on Large Enterprises. Zid and Shopify are coming soon."
};
