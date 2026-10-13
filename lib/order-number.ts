/** A short, readable order number for messages and receipts: the first 8 characters of the order id's unique part. */
export function shortOrderNumber(orderId: string): string {
  const unique = orderId.replace(/^ord-/i, "").replace(/-/g, "");
  return `ORD-${unique.slice(0, 8).toUpperCase()}`;
}
