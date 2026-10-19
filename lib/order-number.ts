/** A short, readable order number for messages and receipts: the first 8 characters of the order id's unique part. */
export function shortOrderNumber(orderId: string): string {
  const unique = orderId.replace(/^ord-/i, "").replace(/-/g, "");
  return `ORD-${unique.slice(0, 8).toUpperCase()}`;
}

type SearchableOrder = {
  id: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  items?: Array<{ productName: string }>;
};

/**
 * Whether an order matches what was typed in the orders search box: its order number (the whole "ORD-CF449CC2", or a
 * part of it, with or without the dash or a leading "#"), the customer's name or phone, or a product in it.
 */
export function orderMatchesQuery(order: SearchableOrder, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase().replace(/^#/, "");
  if (!query) return true;
  const compact = query.replace(/[\s-]/g, "");
  const number = shortOrderNumber(order.id).toLowerCase();
  return (
    number.includes(query) ||
    number.replace(/-/g, "").includes(compact) ||
    order.id.toLowerCase().includes(query) ||
    order.customerName.toLowerCase().includes(query) ||
    order.customerPhone.replace(/\s/g, "").includes(compact) ||
    order.productName.toLowerCase().includes(query) ||
    Boolean(order.items?.some((item) => item.productName.toLowerCase().includes(query)))
  );
}
