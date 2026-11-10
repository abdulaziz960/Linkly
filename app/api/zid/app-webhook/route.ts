import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, requestIdentifier } from "../../../../lib/rate-limit";
import { describeZidAppEvent, parseZidAppEvent, verifyZidAppSecret } from "../../../../lib/zid-app-events";
import { disconnectStore, findTenantByMerchant } from "../../../../lib/store-connections";
import { getTenantCompanyName, logAdminAction } from "../../../../lib/subscriptions";

export const runtime = "nodejs";

/**
 * Zid App Market events about this app (installed, subscription started / renewed / expired, uninstalled...).
 * Zid sends them to the URL set in the Partner Dashboard together with the header X-Linkly-Zid-Secret, which must
 * equal the ZID_APP_WEBHOOK_SECRET variable. Each event is written to the client's activity log; an uninstall also
 * disconnects the store. Billing is not changed from here: a subscription event never changes a Linkly plan.
 */
export async function POST(request: NextRequest) {
  if (!verifyZidAppSecret(request.headers.get("x-linkly-zid-secret"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const limit = await consumeRateLimit("zid-app-webhook", requestIdentifier(request, "zid-app"), 300, 60_000);
  if (!limit.allowed) return NextResponse.json({ ok: false, detail: "rate-limited" }, { status: 429 });

  const raw = await request.text();
  if (raw.length > 256_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const event = parseZidAppEvent(body);
  // An event we do not act on is still answered 200 so Zid does not keep retrying it.
  if (!event) return NextResponse.json({ ok: true, detail: "ignored" });

  const tenantId = (event.storeId && (await findTenantByMerchant("zid", event.storeId, { includeDisconnected: true })))
    || (event.storeUuid && (await findTenantByMerchant("zid", event.storeUuid, { includeDisconnected: true })))
    || null;
  if (!tenantId) {
    // The store has not connected to a Linkly workspace (yet): nothing to update, keep a trace.
    await logAdminAction("system", "النظام", `${describeZidAppEvent(event)} (متجر زد ${event.storeId || event.storeUuid} غير مربوط بأي مساحة).`, "معلومة", "زد").catch(() => undefined);
    return NextResponse.json({ ok: true, detail: "store-not-connected" });
  }

  const company = await getTenantCompanyName(tenantId).catch(() => "");
  if (event.event === "app.market.application.uninstall") {
    await disconnectStore(tenantId, "zid");
    await logAdminAction(tenantId, company, `${describeZidAppEvent(event)} فُصل ربط المتجر.`, "تنبيه", "زد");
    return NextResponse.json({ ok: true, detail: "disconnected" });
  }
  await logAdminAction(tenantId, company, describeZidAppEvent(event), event.event === "app.market.subscription.expired" || event.event === "app.market.subscription.suspended" || event.event === "app.market.subscription.refunded" ? "تنبيه" : "معلومة", "زد");
  return NextResponse.json({ ok: true, detail: "recorded" });
}
