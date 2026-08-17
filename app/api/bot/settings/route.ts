import { NextRequest } from "next/server";
import { getBotSettings, setBotEnabled } from "../../../../lib/bot-engine";
import { getCurrentUser } from "../../../../lib/auth";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  return jsonOk(await getBotSettings(user.tenantId));
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);

  const body = (await request.json()) as { enabled?: boolean };
  await setBotEnabled(user.tenantId, Boolean(body.enabled));
  return jsonOk(await getBotSettings(user.tenantId));
}
