import { getCurrentUser } from "../../../../lib/auth";
import { billingTenantFor } from "../../../../lib/workspaces/store";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";
import { effectiveMessageRate } from "../../../../lib/campaign-metrics";
import { DEFAULT_MESSAGE_RATE } from "../../../../lib/campaign-stats";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "campaigns"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const balanceRow = await prisma.campaignBalance.findUnique({ where: { tenantId: await billingTenantFor(user.tenantId) } });
  const balance = balanceRow?.balance ?? 0;
  const lastTopUpAmount = balanceRow?.lastTopUpAmount ?? 0;
  const [payments, usageEntries] = await Promise.all([
    prisma.campaignPayment.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 100 }),
    // The usage side of the ledger: one running row per campaign (lib/campaign-engine.ts keeps it).
    prisma.campaignBalanceEntry.findMany({ where: { tenantId: user.tenantId }, orderBy: { updatedAt: "desc" }, take: 100 })
  ]);

  const transactions = [
    ...payments.map((payment) => ({
      id: payment.id,
      balance: payment.status === "مكتمل" ? payment.messages : 0,
      usage: `شحن رصيد - ${payment.messages.toLocaleString("en-US")} رسالة`,
      date: payment.completedAt || payment.createdAt,
      status: payment.status,
      cost: payment.amount
    })),
    ...usageEntries.map((entry) => ({
      id: entry.id,
      balance: entry.messages,
      usage: `استخدام في حملة «${entry.note || "—"}» - ${Math.abs(entry.messages).toLocaleString("en-US")} رسالة`,
      date: entry.updatedAt,
      status: "مكتمل",
      cost: 0
    }))
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const messageRate = effectiveMessageRate(payments, DEFAULT_MESSAGE_RATE);

  return jsonOk({ balance, lastTopUpAmount, messageRate, transactions });
}
