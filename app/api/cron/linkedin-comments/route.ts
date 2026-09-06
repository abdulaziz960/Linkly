import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema, getIntegrationSettings } from "../../../../lib/database";
import { getMyOrganizationInfo, listRecentPostUrns, listPostComments } from "../../../../lib/linkedin";
import { storeLinkedinComment } from "../../../../lib/linkedin-inbox";

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
    where: { provider: "linkedin", status: "connected" },
    select: { tenantId: true },
    take: 100
  });

  let tenantsProcessed = 0;
  let synced = 0;
  const errors: Array<{ tenantId: string; error: string }> = [];

  for (const { tenantId } of integrations) {
    try {
      const settings = await getIntegrationSettings("linkedin", tenantId);
      if (!settings.accessToken?.trim()) continue;

      const organization = await getMyOrganizationInfo(settings);
      if (!organization) continue;

      const postUrns = await listRecentPostUrns(settings, organization.urn, 10);
      const sinceIso = settings.linkedinCommentsSyncedAt;
      let latestSeen = sinceIso;

      for (const postUrn of postUrns) {
        const comments = await listPostComments(settings, postUrn, 20);
        for (const comment of comments) {
          if (sinceIso && comment.createdAt && comment.createdAt <= sinceIso) continue;
          await storeLinkedinComment({ tenantId, comment });
          synced += 1;
          if (!latestSeen || comment.createdAt > latestSeen) latestSeen = comment.createdAt;
        }
      }

      if (latestSeen && latestSeen !== sinceIso) {
        await prisma.integrationSetting.updateMany({
          where: { id: settings.id, tenantId },
          data: { linkedinCommentsSyncedAt: latestSeen }
        });
      }

      tenantsProcessed += 1;
    } catch (error) {
      errors.push({
        tenantId,
        error: error instanceof Error ? error.message : "LinkedIn comment sync failed"
      });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, tenantsProcessed, synced, errors });
}
