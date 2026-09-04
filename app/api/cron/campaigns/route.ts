import { NextRequest, NextResponse } from "next/server";
import { activateDueScheduledCampaigns, processCampaignBatch } from "../../../../lib/campaign-engine";
import { prisma } from "../../../../lib/prisma";
import { processDueAutomations } from "../../../../lib/automation-engine";
import { ensureSchema, getIntegrationSettings } from "../../../../lib/database";
import { syncXTenant } from "../../../../lib/x-sync";
import { reconcileStalePendingPayments, sendTrialEndingReminders } from "../../../../lib/subscriptions";
import { sendLowBalanceAlerts } from "../../../../lib/campaign-balance-alerts";

export const runtime = "nodejs";
export const maxDuration = 60;
const baseUrl = () => (process.env.NODE_ENV === "production"
  ? "https://linklysa.io"
  : process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureSchema();

  const [campaignTenants, automationTenants, xTenants] = await Promise.all([
    prisma.campaign.findMany({
      distinct: ["tenantId"],
      where: { status: { in: ["مجدولة", "قيد الإرسال"] } },
      select: { tenantId: true },
      orderBy: { tenantId: "asc" },
      take: 50
    }),
    prisma.automationQueueItem.findMany({
      distinct: ["tenantId"],
      where: { runAt: { lte: new Date().toISOString() } },
      select: { tenantId: true },
      orderBy: { tenantId: "asc" },
      take: 50
    }),
    prisma.integrationSetting.findMany({
      distinct: ["tenantId"],
      where: { provider: "x", status: "connected" },
      select: { tenantId: true },
      orderBy: { tenantId: "asc" },
      take: 50
    })
  ]);

  const tenantIds = [...new Set([...campaignTenants, ...automationTenants].map(({ tenantId }) => tenantId))];
  const xTenantIds = xTenants.map(({ tenantId }) => tenantId);

  for (const tenantId of tenantIds) {
    await activateDueScheduledCampaigns(tenantId);
    await processCampaignBatch(tenantId, 25);
    await processDueAutomations(tenantId);
  }

  const xResults = await Promise.allSettled(xTenantIds.map(async (tenantId) => {
    const settings = await getIntegrationSettings("x", tenantId);
    return syncXTenant(settings);
  }));
  const xSynced = xResults.reduce((total, result) => (
    result.status === "fulfilled" && result.value.ok ? total + result.value.synced : total
  ), 0);

  const paymentsReconciled = await reconcileStalePendingPayments();
  const trialReminders = await sendTrialEndingReminders(baseUrl());
  const lowBalanceAlerts = await sendLowBalanceAlerts(baseUrl()).catch((error) => {
    console.error("Low balance alerts failed", error);
    return { sent: 0 };
  });

  return NextResponse.json({ ok: true, tenantsProcessed: tenantIds.length, xTenantsProcessed: xTenantIds.length, xSynced, paymentsReconciled, trialReminders, lowBalanceAlerts });
}
