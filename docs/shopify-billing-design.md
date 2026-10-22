# Shopify public distribution + Shopify Billing: design

Status: subscription billing and install-first onboarding implemented
(2026-10-22). Not yet done: one-time charges for message top-ups through
Shopify (appPurchaseOneTimeCreate), the App Store listing, and the new public app.

Decisions (2026-10-22): plans are priced in US dollars, set per plan in the admin
plans page; an install with no Linkly account opens one automatically; existing
Moyasar customers who link a store stay on Moyasar; trial is 3 days.

Implementation map:
- lib/shopify-billing.ts - tables (shopify_billing, shopify_plan_prices), checkout,
  confirmation from Shopify's record, webhook, cancel, uninstall, renewals.
- lib/shopify-pricing.ts - USD price math (client-safe).
- lib/shopify-install.ts - install with nobody signed in (create / reinstall / existing email).
- app/api/billing/checkout (routes Shopify-billed workspaces), app/api/billing/shopify/return,
  app/api/billing/cancel (cancels in Shopify too), app/api/shopify/{connect,callback,webhook},
  app/shopify/welcome, cron step in app/api/cron/campaigns.
- tests/shopify-billing.test.ts and the connect/callback tests.

## 1. Goal
Any merchant can install Linkly from Shopify (public distribution). Linkly
subscription charges for those workspaces go through the Shopify Billing API
(appears on the merchant's Shopify invoice). Workspaces that signed up on
linklysa.io and pay with Moyasar are unchanged.

## 2. Distribution
- Custom distribution cannot be changed after selection, so create a NEW app in
  the Dev Dashboard with Public distribution. New Client ID / Secret.
- Keep the current app for the test store until the new one works, then retire it.
- The code supports one Shopify app at a time (SHOPIFY_CLIENT_ID/SECRET), so the
  switch is: set new env values, redeploy, reconnect the test store.
- Config: docs/shopify/shopify.app.toml.example (same URLs and scopes).

## 3. Billing model
| Item | Shopify mechanism |
|---|---|
| Monthly / yearly plan | appSubscriptionCreate with a recurring line item (EVERY_30_DAYS / ANNUAL) |
| Plan change mid-cycle | new appSubscriptionCreate with replacementBehavior APPLY_IMMEDIATELY (Shopify prorates) |
| Free trial | trialDays on the subscription (maps to the existing trial plan) |
| Campaign balance / email credits top-up | appPurchaseOneTimeCreate (one-time charge per top-up) |
| Cancel | appSubscriptionCancel, plus the app/uninstalled webhook |
| Currency | Shopify bills in the shop currency; prices must be defined in USD or the plan price converted. Decision needed (see section 8). |

Test charges: pass test: true on development stores so no real money moves.

## 4. Data model (additive, idempotent DDL like the rest)
- subscription_payments: reuse. gateway = "shopify", gateway_payment_id = the
  AppSubscription / AppPurchaseOneTime GID. Add "shopify" to PAYMENT_GATEWAY.
- subscriptions: add billing_provider ("moyasar" | "shopify", default "moyasar")
  and shopify_subscription_id.
- Workspace is "Shopify-billed" when billing_provider = "shopify". It is set the
  first time the owner chooses to pay through Shopify; it is never switched
  silently.

## 5. Flow
1. Owner opens Billing in Linkly, picks a plan. If a Shopify store is connected
   and provider is shopify, checkout calls POST /api/billing/shopify/checkout.
2. Server stages a pending SubscriptionPayment (same staging as Moyasar, so
   benefits never precede payment), calls appSubscriptionCreate with
   returnUrl = /api/billing/shopify/return?payment=<id>, stores the GID, and
   returns confirmationUrl.
3. Merchant approves on Shopify, lands on the return route. The route does NOT
   trust the query: it re-fetches the subscription by GID (GraphQL
   currentAppInstallation.activeSubscriptions) and, if ACTIVE, calls
   applyConfirmedSubscriptionPayment (existing function).
4. Webhook app_subscriptions/update (HMAC-verified, same /api/shopify/webhook
   endpoint) handles later status changes: ACTIVE, CANCELLED, DECLINED, EXPIRED,
   FROZEN. Renewals: Shopify bills automatically; on each successful cycle we
   create the next SubscriptionPayment row and extend the period.
5. Top-ups use appPurchaseOneTimeCreate and the same return and webhook path
   (app_purchases_one_time/update).

Amount check: compare Shopify's price with the staged amount before applying
(same guard as invoiceAmountMatches). Mismatch: no benefits, admin log entry.

## 6. Code changes
- scopes: no new scope is needed for billing itself.
- lib/shopify-billing.ts (new): GraphQL client, createSubscription,
  createOneTimePurchase, getSubscription, cancelSubscription.
- app/api/billing/shopify/{checkout,return}/route.ts (new).
- app/api/shopify/webhook: handle app_subscriptions/update and
  app_purchases_one_time/update topics (register them in registerShopifyWebhooks).
- lib/subscriptions.ts: attemptAutoRenewals must skip billing_provider = shopify
  (Shopify owns renewal).
- Dashboard billing UI: "Pay with Shopify" path and a banner explaining it.
- Admin panel: show provider on subscription rows.
- Tests: GraphQL mocked; cases: approve, decline, amount mismatch, replayed
  return URL, webhook before return, uninstall cancels, upgrade proration.

## 7. Shopify review checklist (App Store listing)
- Public distribution selected, listing in English (Arabic optional).
- Icon 1200x1200, 3 to 5 screenshots, short + long description, support email,
  privacy policy URL (exists), install instructions.
- Protected customer data access approved (customer names, phones, addresses).
- Compliance webhooks (done) and uninstall cleanup (done).
- Billing through Shopify Billing for Shopify-installed workspaces (this design).
- Install must work from the App Store without a Linkly account: the connect
  route currently requires login. Needs an "install first, then create or link a
  Linkly account" landing flow. This is the largest product change here.

## 8. Open decisions
1. Currency: price plans in USD for Shopify, or convert SAR at a fixed rate?
2. Install-first onboarding: create the Linkly account automatically from the
   Shopify install (shop owner email), or require signup/login first?
3. Existing Linkly customers who already pay with Moyasar: allow linking a
   store without switching billing (recommended: yes, billing_provider stays
   moyasar). Check with Shopify review that this is acceptable.
4. Trial length for Shopify-installed workspaces.

## 9. Estimate
Billing integration 4 to 5 days, install-first onboarding 3 to 4 days,
listing assets and review round trips 1 to 3 weeks of calendar time.
