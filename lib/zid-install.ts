import { prisma } from "./prisma";
import { INDIVIDUALS_PLAN } from "./plan-access";
import { isValidEmail } from "./email-promotions";
import { fetchZidStore, subscribeZidWebhooks, unpackZidToken } from "./zid";
import { findTenantByMerchant, saveStoreTokens } from "./store-connections";

/**
 * Installing Linkly from Zid's App Market: the merchant lands on our app with no Linkly session, so the workspace is
 * created from the owner details Zid gives us (same as Salla's Easy Mode):
 * - the store already belongs to a workspace: the new tokens go to it (a reinstall);
 * - the owner's email already has a Linkly account: nothing is attached without a sign-in, the owner connects from Integrations;
 * - otherwise a workspace is created on a short trial and an activation link goes to the email Zid gave us.
 * Zid does not bill for us, so the plan is chosen in Linkly after the trial.
 */
export type ZidInstallOutcome = "created" | "reinstalled" | "existing_account" | "error";

export const ZID_TRIAL_DAYS = 3;

export type ZidTokens = { token: string; refreshToken: string; expiresAt: string };

export async function installFromZid(tokens: ZidTokens, origin: string): Promise<ZidInstallOutcome> {
  const pair = unpackZidToken(tokens.token);
  const store = pair ? await fetchZidStore(pair) : null;
  if (!store) return "error";
  const { ensureSchema } = await import("./database");
  await ensureSchema();

  const save = (tenantId: string) => saveStoreTokens({ tenantId, store: "zid", accessToken: tokens.token, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, merchantId: store.id, merchantName: store.name });
  const subscribe = (tenantId: string) => subscribeZidWebhooks(tenantId, origin).catch(() => undefined);

  const owner = await findTenantByMerchant("zid", store.id, { includeDisconnected: true });
  if (owner) {
    await save(owner);
    await subscribe(owner);
    return "reinstalled";
  }

  if (!isValidEmail(store.email)) {
    console.error("Zid install without a usable owner email", { merchantId: store.id });
    return "error";
  }
  if (await prisma.userAccount.findUnique({ where: { email: store.email }, select: { id: true } })) return "existing_account";

  const { createTenantWithSubscription } = await import("./subscriptions");
  const created = await createTenantWithSubscription({
    companyName: store.name || store.ownerName || `متجر زد ${store.id}`,
    ownerName: store.ownerName || store.name || "مالك المتجر",
    ownerEmail: store.email,
    plan: INDIVIDUALS_PLAN,
    status: "تجربة",
    amount: 0,
    billingCycle: `تجربة ${ZID_TRIAL_DAYS} أيام`,
    renewalAt: new Date(Date.now() + ZID_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    adminName: `تثبيت من متجر زد (${store.id})`
  });
  const tenantId = created.subscription?.tenantId;
  if (!tenantId) return "error";

  await save(tenantId);
  await subscribe(tenantId);
  try {
    const { sendSallaWelcomeEmail } = await import("./email");
    await sendSallaWelcomeEmail({ to: store.email, name: store.ownerName || store.name, storeName: store.name, tenantId, trialDays: ZID_TRIAL_DAYS, platform: "zid" });
  } catch (error) {
    console.error("Zid welcome email failed", error);
  }
  return "created";
}
