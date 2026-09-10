import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema, getIntegrationSettings } from "../../../../lib/database";
import { listLeadForms, listRecentLeads } from "../../../../lib/snapchat";
import { storeSnapchatLead } from "../../../../lib/snapchat-inbox";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await ensureSchema();

  const integrations = await prisma.integrationSetting.findMany({
    where: { provider: "snapchat", status: "connected" },
    select: { tenantId: true },
    take: 100
  });

  let tenantsProcessed = 0;
  let synced = 0;
  const errors: Array<{ tenantId: string; error: string }> = [];

  for (const { tenantId } of integrations) {
    try {
      const settings = await getIntegrationSettings("snapchat", tenantId);
      if (!settings.accessToken?.trim() || !settings.snapchatAdAccountId) continue;

      const forms = await listLeadForms(settings, settings.snapchatAdAccountId);
      const sinceIso = settings.snapchatLeadsSyncedAt;
      let latestSeen = sinceIso;

      for (const form of forms) {
        const leads = await listRecentLeads(settings, form.id, sinceIso || undefined);
        for (const lead of leads) {
          await storeSnapchatLead({
            tenantId,
            adAccountId: settings.snapchatAdAccountId,
            formId: form.id,
            formName: form.name,
            leadId: lead.leadId,
            answers: lead.answers,
            submittedAt: lead.submittedAt
          });
          synced += 1;
          if (lead.submittedAt && (!latestSeen || lead.submittedAt > latestSeen)) latestSeen = lead.submittedAt;
        }
      }

      if (latestSeen && latestSeen !== sinceIso) {
        await prisma.integrationSetting.updateMany({
          where: { id: settings.id, tenantId },
          data: { snapchatLeadsSyncedAt: latestSeen }
        });
      }

      tenantsProcessed += 1;
    } catch (error) {
      errors.push({
        tenantId,
        error: error instanceof Error ? error.message : "Snapchat lead sync failed"
      });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, tenantsProcessed, synced, errors });
}
