import { NextResponse } from "next/server";
import { syncGmailInbox } from "../../../../lib/email-channel";
import { getCurrentUser } from "../../../../lib/auth";

export const runtime = "nodejs";

// The dashboard asks for a Gmail sync every 30 seconds from every open tab, and one sync reads the Gmail
// inbox and sent folder message by message (7-10 s on a busy mailbox) on the same few database connections
// every other request needs. So: one sync per workspace at a time (a concurrent caller shares its result),
// and none starts within MIN_GAP_MS of the last one finishing (the answer is "nothing new").
const MIN_GAP_MS = 20_000;
const running = new Map<string, Promise<{ synced: number }>>();
const finishedAt = new Map<string, number>();

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = user.tenantId;
  try {
    const active = running.get(tenantId);
    if (active) return NextResponse.json(await active);
    if (Date.now() - (finishedAt.get(tenantId) ?? 0) < MIN_GAP_MS) return NextResponse.json({ synced: 0 });

    const sync = syncGmailInbox(tenantId).finally(() => {
      running.delete(tenantId);
      finishedAt.set(tenantId, Date.now());
    });
    running.set(tenantId, sync);
    return NextResponse.json(await sync);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذرت مزامنة البريد." }, { status: 502 });
  }
}
