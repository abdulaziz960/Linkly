import { NextRequest } from "next/server";
import { getBotNodes, saveBotNodes, botChannels, type BotChannel, type BotNodeInput } from "../../../../lib/bot-engine";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getTenantPlanName } from "../../../../lib/plan-access-server";
import { getTenantGrants } from "../../../../lib/plan-grants";
import { validateBotNodesForPlan } from "../../../../lib/plan-access";
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
  const planCheck = validateBotNodesForPlan(await getTenantPlanName(user.tenantId), nodes, await getBotNodes(user.tenantId, channel), await getTenantGrants(user.tenantId));
  if (!planCheck.ok) return jsonError(planCheck.error, 403);
  await saveBotNodes(user.tenantId, channel, nodes);
  return jsonOk(await getBotNodes(user.tenantId, channel));
}
