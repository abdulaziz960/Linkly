import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

function signingSecret() {
  const configured = process.env.AUTH_SECRET?.trim() || process.env.OAUTH_STATE_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET or OAUTH_STATE_SECRET must be configured in production");
  }
  return "linkly-development-oauth-state-secret";
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createOAuthState(namespace: string, values: Record<string, string>) {
  const nonce = randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = base64Url(JSON.stringify({ namespace, values, nonce, expiresAt }));
  return {
    nonce,
    state: `${payload}.${sign(payload)}`,
    maxAgeSeconds: STATE_TTL_MS / 1000
  };
}

export function verifyOAuthState(state: string | null | undefined, expectedNamespace: string, expectedNonce: string | null | undefined) {
  if (!state || !expectedNonce) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  let parsed: {
    namespace?: unknown;
    values?: unknown;
    nonce?: unknown;
    expiresAt?: unknown;
  };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed.namespace !== expectedNamespace || parsed.nonce !== expectedNonce) return null;
  if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
  if (!parsed.values || typeof parsed.values !== "object") return null;
  return parsed.values as Record<string, string>;
}
