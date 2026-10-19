// What the dashboard may read about the extra payment methods (never a key) and how a merchant saves them. Saving
// registers our notification URL with the provider, which also proves the keys work.

import { randomBytes } from "node:crypto";
import { getAppOrigin } from "../app-url";
import { clearProviderConfig, getProviderConfig, isTabbyReady, isTamaraReady, saveProviderConfig } from "./config";
import { registerTabbyWebhook } from "./tabby";
import { registerTamaraWebhook } from "./tamara";
import type { ProviderKey } from "./types";

export type ProviderStatus = {
  provider: Exclude<ProviderKey, "moyasar">;
  enabled: boolean;
  /** Keys saved (never returned). */
  configured: boolean;
  /** Tabby: the key is a test key. Tamara: sandbox. */
  testMode: boolean;
  merchantCode?: string;
  /** A public key is saved (it is not a secret, but it is not returned either). */
  hasPublicKey: boolean;
};

export async function getProviderStatuses(tenantId: string): Promise<ProviderStatus[]> {
  const [tabby, tamara] = await Promise.all([getProviderConfig(tenantId, "tabby"), getProviderConfig(tenantId, "tamara")]);
  return [
    { provider: "tabby", enabled: tabby.enabled && isTabbyReady(tabby.config), configured: isTabbyReady(tabby.config), testMode: String(tabby.config.secretKey ?? "").startsWith("sk_test_"), merchantCode: tabby.config.merchantCode, hasPublicKey: Boolean(tabby.config.publicKey) },
    { provider: "tamara", enabled: tamara.enabled && isTamaraReady(tamara.config), configured: isTamaraReady(tamara.config), testMode: Boolean(tamara.config.sandbox), hasPublicKey: Boolean(tamara.config.publicKey) }
  ];
}

export type SaveResult = { ok: true; statuses: ProviderStatus[] } | { ok: false; error: string };

export type TabbyInput = { secretKey?: unknown; publicKey?: unknown; merchantCode?: unknown; enabled?: unknown };
export type TamaraInput = { apiToken?: unknown; publicKey?: unknown; notificationToken?: unknown; sandbox?: unknown; enabled?: unknown };

const clean = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);

function webhookUrl(provider: "tabby" | "tamara", tenantId: string) {
  return `${getAppOrigin()}/api/catalog/payment-webhook/${provider}?t=${encodeURIComponent(tenantId)}`;
}

export async function saveTabby(tenantId: string, input: TabbyInput): Promise<SaveResult> {
  const current = await getProviderConfig(tenantId, "tabby");
  const secretKey = clean(input.secretKey) || current.config.secretKey || "";
  const merchantCode = clean(input.merchantCode, 80) || current.config.merchantCode || "";
  const publicKey = clean(input.publicKey) || current.config.publicKey || "";
  const wantEnabled = typeof input.enabled === "boolean" ? input.enabled : current.enabled;

  const keysChanged = secretKey !== (current.config.secretKey ?? "") || merchantCode !== (current.config.merchantCode ?? "");
  if (wantEnabled && (!secretKey || !merchantCode)) return { ok: false, error: "أدخل مفتاح تابي السري ورمز التاجر أولًا" };
  if (secretKey && !/^sk_/.test(secretKey)) return { ok: false, error: "المفتاح السري لتابي يبدأ بـ sk_ (أو sk_test_ للتجربة)" };
  if (publicKey && !/^pk_/.test(publicKey)) return { ok: false, error: "المفتاح العام (Public Key) لتابي يبدأ بـ pk_ (أو pk_test_ للتجربة)" };

  let config = { ...current.config, secretKey, merchantCode, publicKey };
  // Register the notification URL when the keys are new (or it was never registered): this proves the keys and the code.
  const url = webhookUrl("tabby", tenantId);
  if (secretKey && merchantCode && (keysChanged || config.webhookUrl !== url)) {
    const secret = randomBytes(24).toString("hex");
    const registered = await registerTabbyWebhook({ secretKey, merchantCode, webhookSecret: secret, webhookUrl: url }, url, secret);
    if (!registered.ok) return registered;
    config = { ...config, webhookSecret: secret, webhookUrl: url };
  }
  await saveProviderConfig(tenantId, "tabby", { enabled: wantEnabled && Boolean(secretKey && merchantCode), config });
  return { ok: true, statuses: await getProviderStatuses(tenantId) };
}

export async function saveTamara(tenantId: string, input: TamaraInput): Promise<SaveResult> {
  const current = await getProviderConfig(tenantId, "tamara");
  const apiToken = clean(input.apiToken, 4000) || current.config.apiToken || "";
  const notificationToken = clean(input.notificationToken, 4000) || current.config.notificationToken || "";
  const publicKey = clean(input.publicKey, 4000) || current.config.publicKey || "";
  const sandbox = typeof input.sandbox === "boolean" ? input.sandbox : Boolean(current.config.sandbox);
  const wantEnabled = typeof input.enabled === "boolean" ? input.enabled : current.enabled;

  if (wantEnabled && !apiToken) return { ok: false, error: "أدخل رمز واجهة تمارا (API Token) أولًا" };

  const keysChanged = apiToken !== (current.config.apiToken ?? "") || sandbox !== Boolean(current.config.sandbox);
  let config = { ...current.config, apiToken, publicKey, notificationToken, sandbox };
  const url = webhookUrl("tamara", tenantId);
  if (apiToken && (keysChanged || config.webhookUrl !== url)) {
    const secret = randomBytes(24).toString("hex");
    const registered = await registerTamaraWebhook({ apiToken, notificationToken, sandbox, webhookSecret: secret, webhookUrl: url }, url, secret);
    if (!registered.ok) return registered;
    config = { ...config, webhookSecret: secret, webhookUrl: url };
  }
  await saveProviderConfig(tenantId, "tamara", { enabled: wantEnabled && Boolean(apiToken), config });
  return { ok: true, statuses: await getProviderStatuses(tenantId) };
}

export async function removeProvider(tenantId: string, provider: "tabby" | "tamara") {
  await clearProviderConfig(tenantId, provider);
}
