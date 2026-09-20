import { createHash } from "crypto";
import { prisma } from "./prisma";

let tablePromise: Promise<unknown> | null = null;

function rateLimitKey(namespace: string, identifier: string) {
  return createHash("sha256").update(`${namespace}:${identifier}`).digest("hex");
}
async function ensureRateLimitTable() {
  if (process.env.NODE_ENV === "production") return;

  tablePromise ??= prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at TEXT NOT NULL
  )`).catch((error) => {
    tablePromise = null;
    throw error;
  });
  await tablePromise;
}

export function getClientIp(request: Request): string {
  // Opt in only after the reverse proxy in front of this app strips
  // client-supplied forwarding headers and rewrites them itself.
  const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === "true";
  if (!trustProxyHeaders) return "unknown";

  // Cloud Run (and every standard reverse proxy) APPENDS the address it
  // actually saw to any pre-existing X-Forwarded-For header rather than
  // replacing it - so the trustworthy value is the LAST entry, not the
  // first. A client is free to send its own X-Forwarded-For with a forged
  // IP prepended; taking the first entry would trust that forged value
  // outright and defeat the rate limit entirely.
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwarded = forwardedFor?.split(",").pop()?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function requestIdentifier(request: Request, secondary = "") {
  return `${getClientIp(request)}:${secondary.trim().toLowerCase()}`;
}

export async function consumeRateLimit(namespace: string, identifier: string, limit: number, windowMs: number) {
  await ensureRateLimitTable();
  const key = rateLimitKey(namespace, identifier);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const resetAt = new Date(now + windowMs).toISOString();

  return prisma.$transaction(async (tx) => {
    await tx.rateLimit.upsert({
      where: { key },
      update: {},
      create: { key, count: 0, resetAt }
    });

    await tx.rateLimit.updateMany({
      where: { key, resetAt: { lte: nowIso } },
      data: { count: 0, resetAt }
    });

    const claimed = await tx.rateLimit.updateMany({
      where: { key, resetAt: { gt: nowIso }, count: { lt: limit } },
      data: { count: { increment: 1 } }
    });
    const current = await tx.rateLimit.findUnique({ where: { key } });
    const currentReset = current ? new Date(current.resetAt).getTime() : now + windowMs;
    if (claimed.count !== 1) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((currentReset - now) / 1000)) };
    }

    return { allowed: true, remaining: Math.max(0, limit - (current?.count || 0)), retryAfterSeconds: Math.ceil((currentReset - now) / 1000) };
  });
}
