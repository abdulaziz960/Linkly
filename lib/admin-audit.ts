import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";

type AdminActor = { id: string; email: string; name: string };

/**
 * Records a platform admin's OWN action (who suspended a tenant, who
 * changed a plan, who issued a refund) - distinct from AdminLog
 * (lib/subscriptions.ts's logAdminAction), which is tenant-scoped and has
 * no admin-actor field at all. Never throws: an audit-log write failing
 * must never block the actual admin action it's recording.
 */
export async function recordAdminAction(
  admin: AdminActor,
  action: string,
  target?: { type: string; id: string },
  details?: string
): Promise<void> {
  try {
    await ensureSchema();
    await prisma.adminActionLog.create({
      data: {
        id: `aal-${randomUUID()}`,
        adminUserId: admin.id,
        adminEmail: admin.email,
        adminName: admin.name || "",
        action,
        targetType: target?.type || "",
        targetId: target?.id || "",
        details: details || "",
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Failed to record admin action", { action, error });
  }
}

export async function getAdminActionLogs(limit = 300) {
  await ensureSchema();
  return prisma.adminActionLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
