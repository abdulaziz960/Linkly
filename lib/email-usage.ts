import { prisma } from "./prisma";
import { ensureSchema } from "./database";

// Resend's free plan: ~100 emails/day and ~3,000/month (override via env if the plan changes).
const dailyLimit = () => Number(process.env.EMAIL_DAILY_LIMIT) || 100;
const monthlyLimit = () => Number(process.env.EMAIL_MONTHLY_LIMIT) || 3000;
const WARN_RATIO = 0.8;

const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);

/** Counts one email accepted by Resend. Best effort: never throws, never delays or fails a send. */
export async function recordEmailSent() {
  try {
    await ensureSchema();
    const day = utcDay();
    await prisma.emailUsageDay.upsert({ where: { day }, create: { day, sent: 1 }, update: { sent: { increment: 1 } } });
  } catch (error) {
    console.error("[email-usage] could not record a sent email", error);
  }
}

export type EmailUsageStatus = { today: number; month: number; dailyLimit: number; monthlyLimit: number; level: "ok" | "warn" | "limit" };

export function evaluateEmailUsage(today: number, month: number, daily = dailyLimit(), monthly = monthlyLimit()): EmailUsageStatus {
  const limitHit = today >= daily || month >= monthly;
  const warn = today >= daily * WARN_RATIO || month >= monthly * WARN_RATIO;
  return { today, month, dailyLimit: daily, monthlyLimit: monthly, level: limitHit ? "limit" : warn ? "warn" : "ok" };
}

export async function getEmailUsage(): Promise<EmailUsageStatus | null> {
  try {
    await ensureSchema();
    const now = new Date();
    const rows = await prisma.emailUsageDay.findMany({ where: { day: { gte: `${utcDay(now).slice(0, 7)}-01` } } });
    const today = rows.find((row) => row.day === utcDay(now))?.sent ?? 0;
    return evaluateEmailUsage(today, rows.reduce((sum, row) => sum + row.sent, 0));
  } catch (error) {
    console.error("[email-usage] could not read usage", error);
    return null;
  }
}
