// Demo workspaces: temporary, fully separate workspaces opened from a private link (for reviewers). This file is only the
// "is this one?" check, kept light because the Salla adapter and the send code consult it.

import { prisma } from "./prisma";
import { ensureCatalogSchema } from "./catalog-schema";

export const DEMO_DAYS = 7;

let ready: Promise<void> | null = null;
function ensureTables() {
  ready ??= ensureCatalogSchema().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

const cache = new Map<string, { demo: boolean; at: number }>();
const CACHE_MS = 30_000;

export function forgetDemoTenant(tenantId: string) {
  cache.delete(tenantId);
}

/** Whether the workspace is a temporary demo one (answers are cached for 30 seconds). */
export async function isDemoTenant(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.demo;
  await ensureTables();
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string }>>`SELECT tenant_id FROM demo_workspaces WHERE tenant_id = ${tenantId} LIMIT 1`;
  const demo = rows.length > 0;
  cache.set(tenantId, { demo, at: Date.now() });
  return demo;
}

/**
 * fetch for WhatsApp Cloud API calls: a demo workspace's fake phone number id (it starts with "demo-") never reaches Meta,
 * the call is answered as if Meta accepted it. Everything else goes out as before.
 */
export function graphFetch(url: string, init?: RequestInit): Promise<Response> {
  if (/^https:\/\/graph\.facebook\.com\/v[\d.]+\/demo-[^/]+\/(messages|media)$/.test(url)) {
    const id = `demo${Math.random().toString(36).slice(2, 12)}`;
    return Promise.resolve(new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: `wamid.${id}` }], id }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  return fetch(url, init);
}
