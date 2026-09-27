import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { userHasViewPermission } from "../../../../lib/permissions-server";
import { getTenantBranding, updateTenantBranding, MAX_BRAND_LOGO_BYTES } from "../../../../lib/tenant-branding";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  return jsonOk(await getTenantBranding(user.tenantId));
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("يلزم تسجيل الدخول", 401);
  if (!(await userHasViewPermission(user, "settings"))) return jsonError("لا تملك صلاحية الوصول لهذه الميزة", 403);

  const body = (await request.json().catch(() => null)) as { name?: string; logoDataUrl?: string; color?: string } | null;
  const name = body?.name?.trim().slice(0, 60) || "";
  const logoDataUrl = body?.logoDataUrl?.trim() || "";
  const color = body?.color?.trim() || "";

  // svg+xml intentionally excluded - an SVG can carry an embedded <script>,
  // and while every current consumer only renders this via <img>/next/image
  // (which never executes SVG scripts), that's not a guarantee worth
  // depending on for a value accepted straight from the client.
  if (logoDataUrl && !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(logoDataUrl)) {
    return jsonError("صيغة الشعار غير صالحة");
  }
  if (logoDataUrl.length * 0.75 > MAX_BRAND_LOGO_BYTES) {
    return jsonError("حجم الشعار يجب ألا يتجاوز 500 كيلوبايت");
  }
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return jsonError("صيغة اللون غير صالحة");
  }

  const branding = await updateTenantBranding(user.tenantId, { name, logoDataUrl, color });
  return jsonOk(branding);
}
