/**
 * The first character of a name, safe for emoji. `String.charAt(0)` returns
 * HALF of a surrogate pair for a name that starts with an emoji ("😀 Ali"),
 * and that lone half cannot be sent to the database: Prisma fails with
 * "unexpected end of hex escape", which made the WhatsApp webhook answer 500
 * (and Meta retry) for every message from such a customer.
 */
export function firstChar(value: string): string {
  const first = Array.from(value)[0];
  return first ?? "";
}

/** Replaces lone surrogate halves (a broken emoji) with U+FFFD so the text is always valid to store. */
export function wellFormed(value: string): string {
  return value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}
