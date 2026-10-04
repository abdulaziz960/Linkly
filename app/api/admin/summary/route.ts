import { requirePlatformAdmin } from "../../../../lib/admin-auth";
import { ensureSchema } from "../../../../lib/database";
import { prisma } from "../../../../lib/prisma";
import { getSubscriptions } from "../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

const RENEWAL_SOON_DAYS = 7;

export type AdminSummary = {
  renewalsDue: number;
  supportOpen: number;
  supportUrgent: number;
  developmentPending: number;
};

// Small, cheap counters for the sidebar badges (polled by the admin shell).
export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  await ensureSchema();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [subscriptions, supportOpen, supportUrgent, developmentPending] = await Promise.all([
    getSubscriptions(),
    prisma.supportTicket.count({ where: { status: { notIn: ["resolved", "closed"] } } }),
    prisma.supportTicket.count({ where: { priority: "urgent", status: { notIn: ["resolved", "closed"] } } }),
    prisma.featureRequest.count({ where: { status: "pending" } })
  ]);

  const renewalsDue = subscriptions.filter((subscription) => {
    if (subscription.status !== "نشط" || !subscription.renewalAt) return false;
    const date = new Date(`${subscription.renewalAt}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    return Math.round((date.getTime() - today.getTime()) / 86400000) <= RENEWAL_SOON_DAYS;
  }).length;

  const summary: AdminSummary = { renewalsDue, supportOpen, supportUrgent, developmentPending };
  return jsonOk(summary);
}
