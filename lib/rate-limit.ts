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
  // In Vercel, proxy headers are platform-controlled before the request reaches
  // the function. For other reverse proxies, opt in only after the proxy strips
  // client-supplied forwarding headers and rewrites them itself.
  const trustProxyHeaders = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "true";
  if (!trustProxyHeaders) return "unknown";

  const vercelForwarded = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelForwarded) return vercelForwarded;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
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
