import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function nextTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.supportTicketCounter.upsert({
    where: { id: "global" },
    update: { value: { increment: 1 } },
    create: { id: "global", value: 10001 }
  });
  return `LNK-${counter.value}`;
}

/**
 * Writes a support-ticket event to the existing admin_logs table so it
 * surfaces in the platform-admin notification bell (lib/notifications.ts
 * already reads admin_logs) and in the Operational Logs page's per-client
 * filter - both key off clientId, so it must be the real tenantId, not the
 * ticket id (that used to be stored here, which made every support-ticket
 * log row invisible to the client filter and broke the bell's "open this
 * client's logs" link). The ticket number/subject still travels in the
 * message text via ticketLabel.
 */
export async function recordSupportAuditLog(input: {
  actorName: string;
  action: string;
  tenantId: string;
  companyName: string;
  ticketLabel: string;
  level?: "معلومة" | "تنبيه" | "خطأ";
}) {
  await prisma.adminLog.create({
    data: {
      id: `support-${randomUUID()}`,
      at: new Date().toISOString(),
      clientId: input.tenantId,
      clientName: input.companyName,
      source: "الدعم الفني",
      level: input.level || "معلومة",
      message: `${input.action} (${input.ticketLabel}) — بواسطة ${input.actorName}`
    }
  });
}
