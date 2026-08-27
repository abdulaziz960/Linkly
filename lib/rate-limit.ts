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

  return prisma.$transaction(async (tx) => {
    const current = await tx.rateLimit.findUnique({ where: { key } });
    const currentReset = current ? new Date(current.resetAt).getTime() : 0;
    if (!current || !Number.isFinite(currentReset) || currentReset <= now) {
      const resetAt = new Date(now + windowMs).toISOString();
      await tx.rateLimit.upsert({
        where: { key },
        update: { count: 1, resetAt },
        create: { key, count: 1, resetAt }
      });
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: Math.ceil(windowMs / 1000) };
    }

    if (current.count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((currentReset - now) / 1000)) };
    }

    await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return { allowed: true, remaining: Math.max(0, limit - current.count - 1), retryAfterSeconds: Math.ceil((currentReset - now) / 1000) };
  });
}
