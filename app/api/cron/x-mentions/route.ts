import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { syncXMentionsForTenant } from "../../../../../lib/x-public-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function tenantIdFromIntegrationId(id: string) {
  if (id === "x-channel") return "tenant-demo";
  const suffix = ":x-channel";
  return id.endsWith(suffix) ? id.slice(0, -suffix.length) : "";
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const integrations = await prisma.integrationSetting.findMany({
    where: { provider: "x", status: "connected" },
    select: { id: true },
    take: 100
  });

  let tenantsProcessed = 0;
  let synced = 0;
  const errors: Array<{ tenantId: string; error: string }> = [];

  for (const integration of integrations) {
    const tenantId = tenantIdFromIntegrationId(integration.id);
    if (!tenantId) continue;
    try {
      const result = await syncXMentionsForTenant(tenantId);
      tenantsProcessed += 1;
      synced += result.synced || 0;
    } catch (error) {
      errors.push({
        tenantId,
        error: error instanceof Error ? error.message : "X sync failed"
      });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, tenantsProcessed, synced, errors });
}
