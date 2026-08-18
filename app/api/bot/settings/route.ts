import { NextRequest } from "next/server";
import { getBotSettings, setBotEnabled, botChannels, type BotChannel } from "../../../../lib/bot-engine";
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
  return jsonOk(await getBotSettings(user.tenantId, getChannel(request)));
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "bot"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const channel = getChannel(request);
  const body = (await request.json()) as { enabled?: boolean };
  await setBotEnabled(user.tenantId, channel, Boolean(body.enabled));
  return jsonOk(await getBotSettings(user.tenantId, channel));
}
