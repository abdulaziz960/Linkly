import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema, getIntegrationSettings } from "../../../../lib/database";
import { getMyChannelInfo, listRecentVideoIds, listCommentThreads } from "../../../../lib/youtube";
import { storeYoutubeComment } from "../../../../lib/youtube-inbox";

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
    where: { provider: "youtube", status: "connected" },
    select: { tenantId: true },
    take: 100
  });

  let tenantsProcessed = 0;
  let synced = 0;
  const errors: Array<{ tenantId: string; error: string }> = [];

  for (const { tenantId } of integrations) {
    try {
      const settings = await getIntegrationSettings("youtube", tenantId);
      if (!settings.accessToken?.trim()) continue;

      const channel = await getMyChannelInfo(settings);
      if (!channel?.uploadsPlaylistId) continue;

      const videoIds = await listRecentVideoIds(settings, channel.uploadsPlaylistId, 10);
      const sinceIso = settings.youtubeCommentsSyncedAt;
      let latestSeen = sinceIso;

      for (const videoId of videoIds) {
        const threads = await listCommentThreads(settings, videoId, 20);
        for (const comment of threads) {
          if (sinceIso && comment.publishedAt && comment.publishedAt <= sinceIso) continue;
          await storeYoutubeComment({ tenantId, comment });
          synced += 1;
          if (!latestSeen || comment.publishedAt > latestSeen) latestSeen = comment.publishedAt;
        }
      }

      if (latestSeen && latestSeen !== sinceIso) {
        await prisma.integrationSetting.updateMany({
          where: { id: settings.id, tenantId },
          data: { youtubeCommentsSyncedAt: latestSeen }
        });
      }

      tenantsProcessed += 1;
    } catch (error) {
      errors.push({
        tenantId,
        error: error instanceof Error ? error.message : "YouTube comment sync failed"
      });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, tenantsProcessed, synced, errors });
}
