import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { userHasViewPermission } from "../../../lib/permissions-server";
import { createKbEntry, listKbEntries } from "../../../lib/knowledge-base";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "knowledgeBase"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  return jsonOk(await listKbEntries(user.tenantId));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("غير مصرح", 401);
  if (!(await userHasViewPermission(user, "knowledgeBase"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as { question?: string; answer?: string } | null;
  const answer = body?.answer?.trim();
  if (!answer) return jsonError("محتوى الإجابة مطلوب");

  const entry = await createKbEntry(user.tenantId, { question: body?.question?.trim() || "", answer });
  return jsonOk(entry);
}
