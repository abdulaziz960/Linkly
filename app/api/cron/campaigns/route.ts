import { NextRequest, NextResponse } from "next/server";
import { activateDueScheduledCampaigns, processCampaignBatch } from "../../../../lib/campaign-engine";
import { prisma } from "../../../../lib/prisma";
import { processDueAutomations } from "../../../../lib/automation-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [campaignTenants, automationTenants] = await Promise.all([
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
    })
  ]);

  const tenantIds = [...new Set([...campaignTenants, ...automationTenants].map(({ tenantId }) => tenantId))];

  for (const tenantId of tenantIds) {
    await activateDueScheduledCampaigns(tenantId);
    await processCampaignBatch(tenantId, 25);
    await processDueAutomations(tenantId);
  }

  return NextResponse.json({ ok: true, tenantsProcessed: tenantIds.length });
}
