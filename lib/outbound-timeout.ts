// Upper bound for calls to third-party messaging APIs (Meta, Telegram,
// Unifonic) made while a user is waiting on the Send button. Without it a
// hung upstream request keeps the API route open until the platform limit.
export const OUTBOUND_SEND_TIMEOUT_MS = 15_000;
export const OUTBOUND_MEDIA_TIMEOUT_MS = 30_000;

export function outboundSignal(ms: number = OUTBOUND_SEND_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}
