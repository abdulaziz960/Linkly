import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-storage";
import type { StoreKey } from "./store-settings";

/**
 * The OAuth connection of a workspace to an online store (Salla, Zid): tokens (encrypted), the
 * store's own merchant id (to recognise its webhooks), and a status. One row per workspace and store.
 * Raw SQL on a table created on first use, like the other self-contained integrations.
 */

export type StoreConnection = {
  store: StoreKey;
  status: "connected" | "disconnected";
  merchantId: string;
  merchantName: string;
  expiresAt: string;
  updatedAt: string;
};

type Row = {
  tenant_id: string;
  store: string;
  status: string;
  merchant_id: string;
  merchant_name: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
  updated_at: string;
};

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS store_connections (
      tenant_id TEXT NOT NULL,
      store TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disconnected',
      merchant_id TEXT NOT NULL DEFAULT '',
      merchant_name TEXT NOT NULL DEFAULT '',
      access_token_enc TEXT NOT NULL DEFAULT '',
      refresh_token_enc TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, store)
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS store_connections_merchant_idx ON store_connections (store, merchant_id)`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

async function readRow(tenantId: string, store: StoreKey): Promise<Row | null> {
  await ensureTable();
  const rows = await prisma.$queryRaw<Row[]>`SELECT tenant_id, store, status, merchant_id, merchant_name, access_token_enc, refresh_token_enc, expires_at, updated_at FROM store_connections WHERE tenant_id = ${tenantId} AND store = ${store} LIMIT 1`;
  return rows[0] ?? null;
}

function publicShape(store: StoreKey, row: Row | null): StoreConnection {
  return {
    store,
    status: row?.status === "connected" && row.access_token_enc ? "connected" : "disconnected",
    merchantId: row?.merchant_id ?? "",
    merchantName: row?.merchant_name ?? "",
    expiresAt: row?.expires_at ?? "",
    updatedAt: row?.updated_at ?? ""
  };
}

/** For the screen: never contains a token. */
export async function getStoreConnection(tenantId: string, store: StoreKey): Promise<StoreConnection> {
  return publicShape(store, await readRow(tenantId, store));
}

export async function saveStoreTokens(input: {
  tenantId: string;
  store: StoreKey;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  merchantId?: string;
  merchantName?: string;
}): Promise<void> {
  await ensureTable();
  const existing = await readRow(input.tenantId, input.store);
  const now = new Date().toISOString();
  const next = {
    access: encryptSecret(input.accessToken),
    refresh: input.refreshToken ? encryptSecret(input.refreshToken) : existing?.refresh_token_enc ?? "",
    merchantId: input.merchantId ?? existing?.merchant_id ?? "",
    merchantName: input.merchantName ?? existing?.merchant_name ?? ""
  };
  if (existing) {
    await prisma.$executeRaw`UPDATE store_connections SET status = 'connected', merchant_id = ${next.merchantId}, merchant_name = ${next.merchantName}, access_token_enc = ${next.access}, refresh_token_enc = ${next.refresh}, expires_at = ${input.expiresAt}, updated_at = ${now} WHERE tenant_id = ${input.tenantId} AND store = ${input.store}`;
  } else {
    await prisma.$executeRaw`INSERT INTO store_connections (tenant_id, store, status, merchant_id, merchant_name, access_token_enc, refresh_token_enc, expires_at, updated_at) VALUES (${input.tenantId}, ${input.store}, 'connected', ${next.merchantId}, ${next.merchantName}, ${next.access}, ${next.refresh}, ${input.expiresAt}, ${now})`;
  }
}

export async function disconnectStore(tenantId: string, store: StoreKey): Promise<void> {
  await ensureTable();
  await prisma.$executeRaw`UPDATE store_connections SET status = 'disconnected', access_token_enc = '', refresh_token_enc = '', expires_at = '', updated_at = ${new Date().toISOString()} WHERE tenant_id = ${tenantId} AND store = ${store}`;
}

/** The workspace that connected this store account (webhooks identify the store, not the workspace). */
export async function findTenantByMerchant(store: StoreKey, merchantId: string): Promise<string | null> {
  if (!merchantId) return null;
  await ensureTable();
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM store_connections WHERE store = ${store} AND merchant_id = ${merchantId} AND status = 'connected' LIMIT 1`;
  return rows[0]?.tenant_id ?? null;
}

export type StoreTokens = { accessToken: string; refreshToken: string; expiresAt: string; merchantId: string };

export async function readStoreTokens(tenantId: string, store: StoreKey): Promise<StoreTokens | null> {
  const row = await readRow(tenantId, store);
  if (!row || row.status !== "connected" || !row.access_token_enc) return null;
  return {
    accessToken: decryptSecret(row.access_token_enc),
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : "",
    expiresAt: row.expires_at,
    merchantId: row.merchant_id
  };
}
