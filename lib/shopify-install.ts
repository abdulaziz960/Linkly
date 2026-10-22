import { prisma } from "./prisma";
import { LARGE_ORG_PLAN } from "./plan-access";
import { isValidEmail } from "./email-promotions";
import { findTenantByMerchant } from "./store-connections";
import { exchangeShopifyCode, fetchShopifyShopOwner, registerShopifyWebhooks, saveShopifyConnection } from "./shopify";
import { markShopifyBilled } from "./shopify-billing";

/**
 * Installing Linkly from a Shopify store when nobody is signed in to Linkly (docs/shopify-billing-design.md):
 * - the shop already belongs to a workspace: the new token goes to that workspace (a reinstall);
 * - the shop's email already has a Linkly account: nothing is created - the owner signs in and connects
 *   the store from Integrations (never attached to an existing account automatically);
 * - otherwise a workspace is created for the shop owner on a 3-day trial of the plan that includes store
 *   integrations, marked Shopify-billed, and an activation link goes to the shop's email.
 */
export type InstallOutcome = "created" | "reinstalled" | "existing_account" | "error";

export const SHOPIFY_TRIAL_DAYS = 3;

export async function installFromShopify(shop: string, code: string, origin: string): Promise<InstallOutcome> {
  const tokens = await exchangeShopifyCode(shop, code);
  if ("error" in tokens) return "error";
  const webhookAddress = `${origin}/api/shopify/webhook`;

  const owner = await findTenantByMerchant("shopify", shop, { includeDisconnected: true });
  if (owner) {
    const info = await fetchShopifyShopOwner(shop, tokens.accessToken);
    await saveShopifyConnection(owner, shop, tokens.accessToken, info?.name || shop);
    await registerShopifyWebhooks(shop, tokens.accessToken, webhookAddress);
    return "reinstalled";
  }

  const info = await fetchShopifyShopOwner(shop, tokens.accessToken);
  if (!info || !isValidEmail(info.email)) return "error";
  const existing = await prisma.userAccount.findUnique({ where: { email: info.email }, select: { id: true } });
  if (existing) return "existing_account";

  const { createTenantWithSubscription } = await import("./subscriptions");
  const created = await createTenantWithSubscription({
    companyName: info.name,
    ownerName: info.owner,
    ownerEmail: info.email,
    plan: LARGE_ORG_PLAN,
    status: "تجربة",
    amount: 0,
    billingCycle: `تجربة ${SHOPIFY_TRIAL_DAYS} أيام`,
    renewalAt: new Date(Date.now() + SHOPIFY_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    adminName: `تثبيت من متجر شوبيفاي (${shop})`
  });
  const tenantId = created.subscription?.tenantId;
  if (!tenantId) return "error";

  await saveShopifyConnection(tenantId, shop, tokens.accessToken, info.name);
  await markShopifyBilled(tenantId, shop);
  const webhooks = await registerShopifyWebhooks(shop, tokens.accessToken, webhookAddress);
  if (webhooks.failed.length) console.error("Shopify webhook registration incomplete on install", { shop, failed: webhooks.failed });
  return "created";
}
