import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { ensureSchema } from "../../../../lib/database";
import { storeSnapchatLead } from "../../../../lib/snapchat-inbox";

export const runtime = "nodejs";

// Best-effort receiver: Snapchat's Marketing API doesn't have a confirmed,
// universally-available real-time push webhook for individual Lead
// Generation Ads submissions the way Meta/LinkedIn offer for comments (see
// lib/snapchat.ts's comment on this) - app/api/cron/snapchat-leads is the
// mechanism this integration actually relies on. This route exists as a
// drop-in for if/when Snap grants real-time delivery for this app; verify
// its actual payload shape and signature scheme against Snap's live docs at
// that point rather than trusting the shape assumed below.
type SnapchatLeadWebhookPayload = {
  ad_account_id?: string;
  lead?: {
    id?: string;
    form_id?: string;
    form_name?: string;
    create_time?: string;
    form_data?: Array<{ question?: string; answer?: string }>;
  };
};

function isAuthorized(request: NextRequest) {
  const configuredToken = process.env.SNAPCHAT_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!configuredToken) return false;
  return request.headers.get("x-snapchat-verify-token") === configuredToken;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as SnapchatLeadWebhookPayload | null;
  const adAccountId = payload?.ad_account_id;
  const leadId = payload?.lead?.id;
  if (!adAccountId || !leadId) {
    return NextResponse.json({ ok: false, error: "Missing ad_account_id or lead.id" }, { status: 400 });
  }

  await ensureSchema();
  const settings = await prisma.integrationSetting.findFirst({
    where: { provider: "snapchat", snapchatAdAccountId: adAccountId },
    select: { tenantId: true }
  });
  if (!settings) {
    return NextResponse.json({ ok: false, error: "No tenant connected to this ad account" }, { status: 404 });
  }

  await storeSnapchatLead({
    tenantId: settings.tenantId,
    adAccountId,
    formId: payload?.lead?.form_id || "",
    formName: payload?.lead?.form_name || "",
    leadId,
    answers: (payload?.lead?.form_data || []).map((field) => ({ question: field.question || "", answer: field.answer || "" })),
    submittedAt: payload?.lead?.create_time
  });

  return NextResponse.json({ ok: true });
}
