import { NextRequest } from "next/server";
import { requirePlatformAdmin } from "../../../../../../lib/admin-auth";
import { recordAdminAction } from "../../../../../../lib/admin-audit";
import { addClientNote, deleteClientNote, listClientNotes, validateNoteBody } from "../../../../../../lib/client-notes";
import { getSubscriptions } from "../../../../../../lib/subscriptions";
import { jsonError, jsonOk } from "../../../../_utils/json";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function clientExists(tenantId: string) {
  return (await getSubscriptions()).some((subscription) => subscription.tenantId === tenantId);
}

export async function GET(_request: NextRequest, { params }: Params) {
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id: tenantId } = await params;
  try {
    return jsonOk(await listClientNotes(tenantId));
  } catch (error) {
    console.error("client notes list failed", error);
    return jsonError("تعذر تحميل الملاحظات", 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id: tenantId } = await params;

  const body = (await request.json().catch(() => ({}))) as { body?: unknown };
  const parsed = validateNoteBody(body.body);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  if (!(await clientExists(tenantId))) return jsonError("العميل غير موجود", 404);

  try {
    const note = await addClientNote(tenantId, { id: admin.id, name: admin.name }, parsed.body);
    // The note text itself stays out of the audit log; only its size is recorded.
    await recordAdminAction(admin, "add-client-note", { type: "tenant", id: tenantId }, JSON.stringify({ length: parsed.body.length }));
    return jsonOk(note);
  } catch (error) {
    console.error("client note create failed", error);
    return jsonError("تعذر حفظ الملاحظة", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const admin = await requirePlatformAdmin("clients");
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);
  const { id: tenantId } = await params;
  const noteId = new URL(request.url).searchParams.get("noteId") || "";
  if (!noteId) return jsonError("معرّف الملاحظة مطلوب", 400);

  try {
    const removed = await deleteClientNote(tenantId, noteId);
    if (!removed) return jsonError("الملاحظة غير موجودة", 404);
    await recordAdminAction(admin, "delete-client-note", { type: "tenant", id: tenantId }, JSON.stringify({ noteId }));
    return jsonOk({ id: noteId });
  } catch (error) {
    console.error("client note delete failed", error);
    return jsonError("تعذر حذف الملاحظة", 500);
  }
}
