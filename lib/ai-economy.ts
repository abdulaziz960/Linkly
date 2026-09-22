// Reviewed against Google's Standard text pricing on 2026-09-21.
// This is an application guard, NOT a guarantee on the Google Cloud invoice.
export const ECONOMY_MODEL = "gemini-3.1-flash-lite";
export const ECONOMY_INPUT_USD = 0.25;
export const ECONOMY_OUTPUT_USD = 1.5;
export const ECONOMY_OUTPUT_TOKENS = 512;
export const ECONOMY_MAX_INPUT_BYTES = 12000;
// Conservative fixed allowance; failed/ambiguous attempts are not refunded.
export const ECONOMY_RESERVATION_SAR = 0.025;
export const MANAGED_BUDGET_TENANT = "__linkly_managed_ai_budget__";
export function managedMonthlyRequestCap() {
  const raw = process.env.AI_MANAGED_BUDGET_SAR?.trim();
  const budget = raw === undefined || raw === "" ? 50 : Number(raw);
  // Never silently increase the approved 50 SAR envelope.
  return Number.isFinite(budget) && budget >= 0 && budget <= 50
    ? Math.floor(budget * 1000 / 25) : 0;
}
export function clipUtf8(value: string, bytes: number) {
  let result = ""; let used = 0;
  for (const char of value) {
    used += Buffer.byteLength(char, "utf8");
    if (used > bytes) break;
    result += char;
  }
  return result;
}
