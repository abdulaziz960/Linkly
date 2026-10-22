import { NextRequest, NextResponse } from "next/server";
import { handleSallaWebhook } from "../../../../lib/store-engine";
import { verifySallaWebhook } from "../../../../lib/salla";

export const runtime = "nodejs";

/** Salla's events (order created / status updated, abandoned cart). Verified by signature before anything is read. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 512_000) return NextResponse.json({ ok: false }, { status: 413 });
  const valid = verifySallaWebhook(raw, { signature: request.headers.get("x-salla-signature"), authorization: request.headers.get("authorization") });
  if (!valid) return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });

  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const outcome = await handleSallaWebhook(body);
  console.info("Salla webhook handled", { event: (body as { event?: string } | null)?.event ?? "", detail: outcome.detail ?? "", status: outcome.status });
  return NextResponse.json({ ok: outcome.handled, detail: outcome.detail }, { status: outcome.status });
}
