import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-storage";
import { INDIVIDUALS_PLAN } from "./plan-access";
import { isValidEmail } from "./email-promotions";
import { fetchSallaInstaller } from "./salla";
import { findTenantByMerchant, saveStoreTokens } from "./store-connections";
import { ensureSallaBillingTables, markSallaBilled, replayQueuedSallaEvents } from "./salla-billing";

/**
 * Installing Linkly from Salla's app store (Easy Mode): Salla sends the tokens in the app.store.authorize webhook,
 * nobody is signed in to Linkly.
 * - the store already belongs to a workspace: the new tokens go to it (a reinstall);
 * - the owner's email already has a Linkly account: nothing is attached automatically - the tokens wait, encrypted,
 *   and the owner confirms from Integrations while signed in;
 * - otherwise a workspace is created for the owner on a short trial, marked Salla-billed, and an activation link goes
 *   to the email Salla gave us. Salla's own trial/subscription events then set the plan and dates.
 */
export type SallaInstallOutcome = "created" | "reinstalled" | "existing_account" | "error";

export const SALLA_TRIAL_DAYS = 3;

export type SallaAuthorization = { accessToken: string; refreshToken: string; expiresAt: string };

/** Salla's `expires` is a unix timestamp in seconds. */
export function sallaExpiryIso(expires: unknown): string {
  const seconds = Number(expires);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : "";
}

export async function installFromSalla(merchantId: string, auth: SallaAuthorization): Promise<SallaInstallOutcome> {
  const { ensureSchema } = await import("./database");
  await ensureSchema();
  await ensureSallaBillingTables();
  const owner = await findTenantByMerchant("salla", merchantId, { includeDisconnected: true });
  if (owner) {
    await saveStoreTokens({ tenantId: owner, store: "salla", ...auth, merchantId });
    // Linkly reinstalled after an uninstall: access returns only if Salla bills it again, which its events tell us.
    return "reinstalled";
  }

  const info = await fetchSallaInstaller(auth.accessToken);
  if (!info || !isValidEmail(info.email)) {
    console.error("Salla install without a usable owner email", { merchantId, hasInfo: Boolean(info) });
    return "error";
  }
  const existing = await prisma.userAccount.findUnique({ where: { email: info.email }, select: { id: true } });
  if (existing) {
    const now = new Date().toISOString();
    const access = encryptSecret(auth.accessToken);
    const refresh = auth.refreshToken ? encryptSecret(auth.refreshToken) : "";
    await prisma.$executeRaw`INSERT INTO salla_pending_links (merchant_id, email, merchant_name, access_token_enc, refresh_token_enc, expires_at, created_at) VALUES (${merchantId}, ${info.email}, ${info.merchantName}, ${access}, ${refresh}, ${auth.expiresAt}, ${now}) ON CONFLICT (merchant_id) DO UPDATE SET email = ${info.email}, merchant_name = ${info.merchantName}, access_token_enc = ${access}, refresh_token_enc = ${refresh}, expires_at = ${auth.expiresAt}, created_at = ${now}`;
    return "existing_account";
  }

  const { createTenantWithSubscription } = await import("./subscriptions");
  const created = await createTenantWithSubscription({
    companyName: info.merchantName || info.name || `متجر سلة ${merchantId}`,
    ownerName: info.name || info.merchantName || "مالك المتجر",
    ownerEmail: info.email,
    plan: INDIVIDUALS_PLAN,
    status: "تجربة",
    amount: 0,
    billingCycle: `تجربة ${SALLA_TRIAL_DAYS} أيام`,
    renewalAt: new Date(Date.now() + SALLA_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    adminName: `تثبيت من متجر سلة (${merchantId})`
  });
  const tenantId = created.subscription?.tenantId;
  if (!tenantId) return "error";

  await saveStoreTokens({ tenantId, store: "salla", ...auth, merchantId, merchantName: info.merchantName });
  await markSallaBilled(tenantId, merchantId);
  await replayQueuedSallaEvents(merchantId, tenantId);
  // The activation link was sent with the workspace; this tells the merchant what to do next. A mail failure never fails the install.
  try {
    const { sendSallaWelcomeEmail } = await import("./email");
    await sendSallaWelcomeEmail({ to: info.email, name: info.name || info.merchantName, storeName: info.merchantName, tenantId, trialDays: SALLA_TRIAL_DAYS });
  } catch (error) {
    console.error("Salla welcome email failed", error);
  }
  return "created";
}

/** The pending install waiting for this signed-in owner's email, if any (never contains tokens). */
export async function getSallaPendingLink(email: string): Promise<{ merchantId: string; merchantName: string } | null> {
  await ensureSallaBillingTables();
  const rows = await prisma.$queryRaw<Array<{ merchant_id: string; merchant_name: string }>>`SELECT merchant_id, merchant_name FROM salla_pending_links WHERE email = ${email.trim().toLowerCase()} ORDER BY created_at DESC LIMIT 1`;
  return rows[0] ? { merchantId: rows[0].merchant_id, merchantName: rows[0].merchant_name } : null;
}

/** The owner confirms: the waiting tokens become this workspace's Salla connection. Billing stays with Linkly. */
export async function claimSallaPendingLink(tenantId: string, email: string): Promise<boolean> {
  await ensureSallaBillingTables();
  const rows = await prisma.$queryRaw<Array<{ merchant_id: string; merchant_name: string; access_token_enc: string; refresh_token_enc: string; expires_at: string }>>`SELECT merchant_id, merchant_name, access_token_enc, refresh_token_enc, expires_at FROM salla_pending_links WHERE email = ${email.trim().toLowerCase()} ORDER BY created_at DESC LIMIT 1`;
  const row = rows[0];
  if (!row) return false;
  const takenBy = await findTenantByMerchant("salla", row.merchant_id);
  if (takenBy && takenBy !== tenantId) return false;
  await saveStoreTokens({
    tenantId,
    store: "salla",
    accessToken: decryptSecret(row.access_token_enc),
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : "",
    expiresAt: row.expires_at,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name
  });
  await prisma.$executeRaw`DELETE FROM salla_pending_links WHERE merchant_id = ${row.merchant_id}`;
  return true;
}
