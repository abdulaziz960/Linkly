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

const SENSITIVE_KEY = /(key|secret|token|password|authorization|cookie|hash|signature)/i;

function normalise(value: unknown): string | number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join("، ");
  if (typeof value === "object") return "";
  return value as string | number;
}

/**
 * Details string for an update: the previous and new values of only the fields
 * that actually changed ({ before, after }), so the audit log can show
 * "from -> to". Sensitive-looking keys are never recorded. When nothing
 * changed (or no field is comparable) it falls back to the submitted patch.
 */
export function changeDetails(before: Record<string, unknown>, patch: Record<string, unknown>, subject?: string): string {
  const beforeOut: Record<string, string | number> = {};
  const afterOut: Record<string, string | number> = {};
  for (const [key, next] of Object.entries(patch)) {
    if (next === undefined || SENSITIVE_KEY.test(key)) continue;
    const previous = normalise(before[key]);
    const current = normalise(next);
    if (String(previous) === String(current)) continue;
    beforeOut[key] = previous;
    afterOut[key] = current;
  }
  if (Object.keys(afterOut).length === 0) {
    const safe = Object.fromEntries(Object.entries(patch).filter(([key, value]) => value !== undefined && !SENSITIVE_KEY.test(key)).map(([key, value]) => [key, normalise(value)]));
    return JSON.stringify(subject ? { subject, ...safe } : safe);
  }
  return JSON.stringify({ ...(subject ? { subject } : {}), before: beforeOut, after: afterOut });
}
