import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export const SUPPORT_STATUSES = [
  "new",
  "open",
  "in_progress",
  "waiting_customer",
  "waiting_support",
  "resolved",
  "closed"
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_CATEGORIES = [
  "technical",
  "account",
  "billing",
  "subscription",
  "whatsapp",
  "integrations",
  "api",
  "bug",
  "feature_request",
  "other"
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const REOPEN_WINDOW_DAYS = 7;

export function isSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === "string" && (SUPPORT_STATUSES as readonly string[]).includes(value);
}

export function isSupportPriority(value: unknown): value is SupportPriority {
  return typeof value === "string" && (SUPPORT_PRIORITIES as readonly string[]).includes(value);
}

export function isSupportCategory(value: unknown): value is SupportCategory {
  return typeof value === "string" && (SUPPORT_CATEGORIES as readonly string[]).includes(value);
}

/** Ticket status the moment the customer sends a new message. */
export function statusAfterCustomerReply(current: string): SupportStatus {
  if (current === "resolved" || current === "closed") return "open";
  return "waiting_support";
}

/** Ticket status the moment an agent sends a customer-visible reply (never called for internal notes). */
export function statusAfterAgentReply(current: string): SupportStatus {
  if (current === "resolved" || current === "closed") return current as SupportStatus;
  return "waiting_customer";
}

export function canReopen(resolvedOrClosedAt: string, now: Date = new Date()): boolean {
  if (!resolvedOrClosedAt) return true;
  const closedTime = new Date(resolvedOrClosedAt).getTime();
  if (!Number.isFinite(closedTime)) return true;
  return now.getTime() - closedTime <= REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export async function nextTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.supportTicketCounter.upsert({
    where: { id: "global" },
    update: { value: { increment: 1 } },
    create: { id: "global", value: 10001 }
  });
  return `LNK-${counter.value}`;
}

export type SupportAttachmentInput = {
  type?: "image" | "audio" | "document";
  name?: string;
  dataUrl?: string;
  mimeType?: string;
};

const ATTACHMENT_MIME_ALLOWLIST: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp"],
  audio: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg", "audio/webm", "audio/wav", "audio/x-wav"],
  document: [
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]
};

function parseDataUrl(dataUrl?: string) {
  if (!dataUrl) return null;
  const match = /^data:([^;,]+)(;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  const [, mimeType, , isBase64, data] = match;
  try {
    const buffer = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8");
    return { mimeType: mimeType.toLowerCase(), buffer };
  } catch {
    return null;
  }
}

function getBaseMimeType(mimeType: string) {
  return mimeType.split(";")[0].trim().toLowerCase();
}

/** Mirrors the attachment limits already enforced in app/api/conversations/[id]/messages/route.ts. */
export function validateSupportAttachment(attachment: SupportAttachmentInput): { error: string } | { parsed: { mimeType: string; buffer: Buffer } } {
  if (!attachment.type || !attachment.name || !attachment.dataUrl) return { error: "المرفق غير مكتمل" };
  if (attachment.name.length > 180 || attachment.dataUrl.length > 12 * 1024 * 1024) {
    return { error: "المرفق أكبر من الحد المسموح" };
  }
  const parsed = parseDataUrl(attachment.dataUrl);
  if (!parsed || parsed.buffer.length > 8 * 1024 * 1024) {
    return { error: "المرفق غير صالح أو أكبر من 8 ميجابايت" };
  }
  const mimeType = getBaseMimeType(attachment.mimeType || parsed.mimeType);
  const allowed = ATTACHMENT_MIME_ALLOWLIST[attachment.type] || [];
  if (!allowed.includes(mimeType)) return { error: "نوع المرفق غير مدعوم" };
  return { parsed: { mimeType, buffer: parsed.buffer } };
}

/** Writes a support-ticket event to the existing admin_logs table so it surfaces in the platform-admin notification bell (lib/notifications.ts already reads admin_logs) — no new notification infra. */
export async function recordSupportAuditLog(input: {
  actorName: string;
  action: string;
  ticketId: string;
  ticketLabel: string;
  level?: "معلومة" | "تنبيه" | "خطأ";
}) {
  await prisma.adminLog.create({
    data: {
      id: `support-${randomUUID()}`,
      at: new Date().toISOString(),
      clientId: input.ticketId,
      clientName: input.ticketLabel,
      source: "الدعم الفني",
      level: input.level || "معلومة",
      message: `${input.action} — بواسطة ${input.actorName}`
    }
  });
}

export type SupportMessageLike = { isInternal: number };

/** The customer must never receive internal notes, even if a caller forgets to filter upstream. */
export function excludeInternalMessages<T extends SupportMessageLike>(messages: T[]): T[] {
  return messages.filter((message) => message.isInternal !== 1);
}
