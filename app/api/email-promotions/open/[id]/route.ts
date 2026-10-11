import { NextRequest, NextResponse } from "next/server";
import { markEmailOpened } from "../../../../../lib/email-promotions";

export const runtime = "nodejs";

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await markEmailOpened(id).catch(() => undefined);
  return new NextResponse(PIXEL, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
