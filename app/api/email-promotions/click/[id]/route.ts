import { NextRequest, NextResponse } from "next/server";
import { markEmailClicked } from "../../../../../lib/email-promotions";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = request.nextUrl.searchParams.get("u") || "/";
  await markEmailClicked(id).catch(() => undefined);
  try {
    const url = new URL(target);
    if (url.protocol === "http:" || url.protocol === "https:") return NextResponse.redirect(url);
  } catch {
    // Fall through to the homepage.
  }
  return NextResponse.redirect(new URL("/", request.url));
}
