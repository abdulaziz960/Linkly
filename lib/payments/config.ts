// Per-workspace settings of the extra payment methods, kept encrypted (AES-256-GCM, like every other secret).
// Raw-SQL lazy table, tagged templates (SQLite and Postgres). Moyasar's own key stays where it always was.

import { prisma } from "../prisma";
import { ensureCatalogSchema } from "../catalog-schema";
import { decryptSecret, encryptSecret } from "../secret-storage";
import type { ProviderKey } from "./types";

export type TabbyConfig = {
  /** The secret key (sk_... live, sk_test_... test): the environment follows the key. */
  secretKey: string;
  /** The code Tabby gave the merchant's branch. */
  merchantCode: string;
  /** Secret the merchant's webhook sends back in `X-Auth-Key`, made when the webhook is registered. */
  webhookSecret: string;
  /** The webhook URL already registered at Tabby (so saving again does not register a duplicate). */
  webhookUrl: string;
};

export type TamaraConfig = {
  /** The merchant's API token. */
  apiToken: string;
  /** Tamara's notification token (signs the notifications); optional. */
  notificationToken: string;
  /** Sandbox (testing) or production endpoint. */
  sandbox: boolean;
  /** Secret the registered webhook sends back in its `authorization` header. */
  webhookSecret: string;
  webhookUrl: string;
};

export type ProviderConfigs = { tabby: TabbyConfig; tamara: TamaraConfig };

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

type Row = { enabled: number | bigint; config_enc: string };

export type StoredProvider<K extends keyof ProviderConfigs> = { enabled: boolean; config: Partial<ProviderConfigs[K]> };

export async function getProviderConfig<K extends keyof ProviderConfigs>(tenantId: string, provider: K): Promise<StoredProvider<K>> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT enabled, config_enc FROM catalog_payment_providers WHERE tenant_id = ${tenantId} AND provider = ${provider} LIMIT 1`;
  const row = rows[0];
  if (!row) return { enabled: false, config: {} };
  let config: Partial<ProviderConfigs[K]> = {};
  try {
    config = row.config_enc ? (JSON.parse(decryptSecret(row.config_enc)) as Partial<ProviderConfigs[K]>) : {};
  } catch {
    config = {};
  }
  return { enabled: Number(row.enabled) === 1, config };
}

export async function saveProviderConfig<K extends keyof ProviderConfigs>(tenantId: string, provider: K, patch: { enabled?: boolean; config?: Partial<ProviderConfigs[K]> }): Promise<StoredProvider<K>> {
  const current = await getProviderConfig(tenantId, provider);
  const config = { ...current.config, ...(patch.config ?? {}) } as Partial<ProviderConfigs[K]>;
  const enabled = patch.enabled ?? current.enabled;
  const now = new Date().toISOString();
  const enc = encryptSecret(JSON.stringify(config));
  const flag = enabled ? 1 : 0;
  await prisma.$executeRaw`DELETE FROM catalog_payment_providers WHERE tenant_id = ${tenantId} AND provider = ${provider}`;
  await prisma.$executeRaw`INSERT INTO catalog_payment_providers (tenant_id, provider, enabled, config_enc, updated_at) VALUES (${tenantId}, ${provider}, ${flag}, ${enc}, ${now})`;
  return { enabled, config };
}

export async function clearProviderConfig(tenantId: string, provider: ProviderKey) {
  await ensureTable();
  await prisma.$executeRaw`DELETE FROM catalog_payment_providers WHERE tenant_id = ${tenantId} AND provider = ${provider}`;
}

export function isTabbyReady(config: Partial<TabbyConfig>): config is TabbyConfig {
  return Boolean(config.secretKey && config.merchantCode);
}

export function isTamaraReady(config: Partial<TamaraConfig>): config is TamaraConfig {
  return Boolean(config.apiToken);
}
