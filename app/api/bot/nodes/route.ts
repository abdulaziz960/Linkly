import { NextRequest } from "next/server";
import { getBotNodes, saveBotNodes, botChannels, type BotChannel, type BotNodeInput } from "../../../../lib/bot-engine";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

function getChannel(request: NextRequest): BotChannel {
  const value = request.nextUrl.searchParams.get("channel");
  return (botChannels as string[]).includes(value || "") ? (value as BotChannel) : "whatsapp";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "bot"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);
  return jsonOk(await getBotNodes(user.tenantId, getChannel(request)));
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "bot"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const channel = getChannel(request);
  const body = (await request.json()) as { nodes?: BotNodeInput[] };
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  await saveBotNodes(user.tenantId, channel, nodes);
  return jsonOk(await getBotNodes(user.tenantId, channel));
}
