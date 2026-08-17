import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { getCampaignBalance } from "../../../../lib/campaign-engine";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);

  const balance = await getCampaignBalance(user.tenantId);
  const payments = await prisma.campaignPayment.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return jsonOk({
    balance,
    transactions: payments.map((payment) => ({
      id: payment.id,
      balance: payment.status === "مكتمل" ? payment.messages : 0,
      usage: `شحن رصيد - ${payment.messages.toLocaleString("en-US")} رسالة`,
      date: payment.completedAt || payment.createdAt,
      status: payment.status,
      cost: payment.amount
    }))
  });
}
