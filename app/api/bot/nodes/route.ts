import { NextRequest } from "next/server";
import { getBotNodes, saveBotNodes, type BotNodeInput } from "../../../../lib/bot-engine";
import { getCurrentUser } from "../../../../lib/auth";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  return jsonOk(await getBotNodes(user.tenantId));
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as { nodes?: BotNodeInput[] };
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  await saveBotNodes(user.tenantId, nodes);
  return jsonOk(await getBotNodes(user.tenantId));
}
