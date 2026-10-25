// Instagram API with Instagram Login only delivers webhooks for an account after the app subscribes that account:
//   POST https://graph.instagram.com/<account id>/subscribed_apps?subscribed_fields=...&access_token=<account token>
// (the same fields must also be switched on in the Meta app dashboard, and the app must be Live). Connecting an account
// without this call saves its token, but no message ever arrives.

const GRAPH_VERSION = "v22.0";
const FIELD_SETS = ["messages,messaging_postbacks,messaging_seen,comments", "messages,messaging_postbacks", "messages"];

export type InstagramSubscribeResult = { ok: true; fields: string } | { ok: false; error: string };

export async function subscribeInstagramWebhooks(instagramId: string, accessToken: string): Promise<InstagramSubscribeResult> {
  if (!instagramId || !accessToken) return { ok: false, error: "حساب إنستغرام أو الرمز غير متوفر" };
  let lastError = "";
  for (const fields of FIELD_SETS) {
    try {
      const url = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(instagramId)}/subscribed_apps`);
      url.searchParams.set("subscribed_fields", fields);
      url.searchParams.set("access_token", accessToken);
      const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10000) });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: { message?: string } } | null;
      if (response.ok && payload?.success !== false) return { ok: true, fields };
      lastError = payload?.error?.message || `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "تعذر الاتصال بإنستغرام";
    }
  }
  console.error("Instagram webhook subscription failed", { instagramId, error: lastError });
  return { ok: false, error: lastError };
}

/** What the account is subscribed to now (for diagnosing a connection that receives nothing). */
export async function getInstagramSubscriptions(instagramId: string, accessToken: string): Promise<{ ok: true; fields: string[] } | { ok: false; error: string }> {
  try {
    const url = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${encodeURIComponent(instagramId)}/subscribed_apps`);
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const payload = await response.json().catch(() => null) as { data?: Array<{ subscribed_fields?: string[] }>; error?: { message?: string } } | null;
    if (!response.ok) return { ok: false, error: payload?.error?.message || `HTTP ${response.status}` };
    return { ok: true, fields: [...new Set((payload?.data ?? []).flatMap((row) => row.subscribed_fields ?? []))] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر الاتصال بإنستغرام" };
  }
}

/**
 * Subscribes every connected Instagram account again (accounts connected before the subscription step existed receive
 * nothing until they are). Safe to run repeatedly - Meta treats it as an update - so a daily run also keeps them healed.
 */
export async function resubscribeAllInstagramAccounts(): Promise<{ checked: number; subscribed: number; failed: Array<{ tenantId: string; error: string }> }> {
  const { prisma } = await import("./prisma");
  const { decryptSecret } = await import("./secret-storage");
  const rows = await prisma.integrationSetting.findMany({ where: { provider: "instagram", status: "connected", wabaId: { not: "" }, accessToken: { not: "" } }, select: { tenantId: true, wabaId: true, accessToken: true } });
  let subscribed = 0;
  const failed: Array<{ tenantId: string; error: string }> = [];
  for (const row of rows) {
    let token = "";
    try {
      token = decryptSecret(row.accessToken).trim();
    } catch {
      failed.push({ tenantId: row.tenantId, error: "تعذر قراءة الرمز المخزن" });
      continue;
    }
    const result = await subscribeInstagramWebhooks(row.wabaId, token);
    if (result.ok) subscribed += 1;
    else failed.push({ tenantId: row.tenantId, error: result.error });
  }
  return { checked: rows.length, subscribed, failed };
}
