import { NextResponse } from "next/server";
import { syncGmailInbox } from "../../../../lib/email-channel";
import { getCurrentUser } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncGmailInbox(user.tenantId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذرت مزامنة البريد." }, { status: 502 });
  }
}
