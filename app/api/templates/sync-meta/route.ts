import { NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { syncMetaTemplates } from "../../../../lib/meta-templates";

export const runtime = "nodejs";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "يلزم تسجيل الدخول" }, { status: 401 });
  }
  if (!(await userHasViewPermission(user, "templates"))) {
    return NextResponse.json({ ok: false, error: "لا تملك صلاحية الوصول لهذه الميزة" }, { status: 403 });
  }

  const integration = await getIntegrationSettings("whatsapp", user.tenantId);

  if (!integration.wabaId || !integration.accessToken) {
    return NextResponse.json({
      ok: false,
      error: "أدخل WABA ID و Access Token في بيانات الربط قبل المزامنة مع Meta."
    }, { status: 400 });
  }

  const result = await syncMetaTemplates(user.tenantId, integration.wabaId, integration.accessToken);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || "تعذر جلب القوالب من Meta. تأكد من صلاحية التوكن والصلاحيات." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, synced: result.synced });
}
