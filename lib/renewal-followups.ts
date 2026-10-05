import { prisma } from "./prisma";
import { ensureSchema } from "./database";

export const FOLLOW_UP_STATUSES = ["new", "progress", "contacted", "closed"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export type FollowUpEntry = { status: FollowUpStatus; updatedBy: string; updatedAt: string };

export function isFollowUpStatus(value: unknown): value is FollowUpStatus {
  return typeof value === "string" && (FOLLOW_UP_STATUSES as readonly string[]).includes(value);
}

/** Shared follow-up state for renewal alerts, keyed by tenant id. */
export async function getRenewalFollowUps(): Promise<Record<string, FollowUpEntry>> {
  await ensureSchema();
  const rows = await prisma.renewalFollowUp.findMany();
  const result: Record<string, FollowUpEntry> = {};
  for (const row of rows) if (isFollowUpStatus(row.status)) result[row.tenantId] = { status: row.status, updatedBy: row.updatedBy, updatedAt: row.updatedAt };
  return result;
}

export async function setRenewalFollowUp(tenantId: string, status: FollowUpStatus, updatedBy: string): Promise<FollowUpEntry> {
  await ensureSchema();
  const updatedAt = new Date().toISOString();
  await prisma.renewalFollowUp.upsert({
    where: { tenantId },
    update: { status, updatedBy, updatedAt },
    create: { tenantId, status, updatedBy, updatedAt }
  });
  return { status, updatedBy, updatedAt };
}
