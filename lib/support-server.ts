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
