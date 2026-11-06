import { NextRequest, NextResponse } from "next/server";
import { findTikTokLeadConnectionByToken, storeTikTokLead, type TikTokLeadEntry } from "../../../../lib/tiktok-leads";

export const runtime = "nodejs";

/**
 * TikTok posts every new Instant Form lead here (object = 1). The URL carries a per-workspace secret token,
 * since the lead webhook has no documented signature. Delivery is at-least-once, and storing is idempotent.
 */
export async function POST(request: NextRequest) {
  const connection = await findTikTokLeadConnectionByToken(request.nextUrl.searchParams.get("t") || "");
  if (!connection) return NextResponse.json({ ok: false }, { status: 404 });

  const payload = await request.json().catch(() => null) as { object?: number; entry?: TikTokLeadEntry[] } | null;
  if (!payload || payload.object !== 1 || !Array.isArray(payload.entry)) return NextResponse.json({ ok: true, ignored: true });

  let stored = 0;
  for (const entry of payload.entry) {
    try {
      if (await storeTikTokLead(connection.tenantId, entry)) stored += 1;
    } catch (error) {
      console.error("TikTok lead could not be stored", error);
      // A failure must be retried by TikTok: answer 500 so the lead is delivered again.
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, stored });
}
