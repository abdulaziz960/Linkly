import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "This webhook is disabled. Incoming email is now handled through the Gmail connection instead." },
    { status: 410 }
  );
}
