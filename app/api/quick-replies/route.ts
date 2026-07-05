import { NextRequest } from "next/server";
import { getQuickReplies } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getQuickReplies());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { shortcut?: string; text?: string; team?: string; usage?: number };
  if (!body.shortcut?.trim()) return jsonError("الاختصار مطلوب");
  if (!body.text?.trim()) return jsonError("نص الرد مطلوب");

  const reply = await prisma.quickReply.create({
    data: {
      id: `qr-${Date.now()}`,
      shortcut: body.shortcut.trim(),
      text: body.text.trim(),
      team: body.team?.trim() || "",
      usage: body.usage ?? 0
    }
  });

  return jsonOk(reply);
}
