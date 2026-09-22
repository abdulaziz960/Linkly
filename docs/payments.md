# Payments, subscriptions and campaign balances

Linkly sells two things:

1. **A monthly subscription** to the workspace. A `Plan` (starter / growth /
   business, editable by platform admins) sets the monthly price in SAR, the
   employee (seat) limit and optional AI-copilot quotas. Each tenant has one
   `Subscription` row. Its `status` is `تجربة` (trial), `نشط` (active) or
   `متوقف` (suspended), and `renewalAt` is the paid-through date.
2. **Campaign message credits** for WhatsApp campaigns. Each tenant has one
   `CampaignBalance` row holding `balance` (messages remaining). Sending a
   campaign message decrements it by one; a top-up adds a purchased block
   (1 to 1,000,000 messages, volume-priced in `lib/campaign-engine.ts`).

Both are paid through **Moyasar**. Linkly never handles card data: either
Moyasar.js renders the card fields directly (embedded checkout, below) or,
for admin-created invoices, the customer is sent to Moyasar's own hosted
payment page. Either way Linkly only ever learns the outcome afterwards, by
asking Moyasar with our secret key - never by trusting what the browser or a
webhook body claims.

## Payment flow

Self-serve subscription checkout (`/billing/pay/[paymentId]`) and self-serve
campaign top-up checkout (`/billing/pay/campaign/[paymentId]`) both use our
own branded page with Moyasar.js's embedded card form:

```
customer ──POST──> checkout/charge route
                           │  stages a payment row (status: pending), no
                           │  Moyasar invoice created yet
                           └──> { paymentId } → our own /billing/pay/... page
Moyasar.js renders the card form (publishable key only, card data never
                           touches our server) and creates the actual
                           Moyasar Payment directly from the browser
  on_completed (same tab)  ──POST──> confirm-payment route         ┐
  OR out-of-band 3-D Secure ──redirect callback_url──> /billing/success ┤ either path
                           │  re-fetches the Payment from Moyasar with our  │
                           │  secret key (client's reported id/status is    │
                           │  never trusted) and verifies the amount        ┘
                           │  applies the outcome (below)
customer ──> /billing/success (verifies before showing anything as paid)
cron (/api/cron/campaigns) ──> reconcileStalePendingPayments()
                              re-checks any row still pending after 24h
```

Admin-created invoices (`POST /api/admin/subscriptions/charge`) still use the
older hosted-invoice flow:

```
admin ──POST──> charge route
                           │  stages a payment row (status: pending)
                           │  POST https://api.moyasar.com/v1/invoices
                           │    amount (halalas), SAR, description, callback_url,
                           │    success_url, back_url, metadata{platform: Linkly, …}
                           └──> { paymentUrl } → sent to the client, opens Moyasar's hosted page
customer pays on Moyasar
Moyasar ──POST callback_url──> payment-webhook route
                           │  reads ONLY the invoice id from the body
                           │  GET /v1/invoices/{id} with our secret key
                           │  verifies status AND amount
                           │  applies the outcome (below) and answers 200
customer ──redirect success_url──> /billing/success or the campaigns tab
```

### Every payment request carries Linkly metadata

`buildPaymentMetadata()` in `lib/moyasar.ts` produces the metadata object
attached to every invoice (Moyasar) or checkout session (Stripe test mode).
`createMoyasarInvoice` additionally forces `platform: "Linkly"` even if a
caller forgets it. The same JSON is stored on the payment row as
`metadataJson`.

| Key | Example | Purpose |
| --- | --- | --- |
| `platform` | `Linkly` | Always present. Identifies the product in the gateway dashboard and in disputes. |
| `platform_domain` | `linklysa.io` | |
| `product` | `Linkly Subscription` / `Linkly Campaign Messages` | |
| `payment_kind` | `subscription` / `campaign_topup` | |
| `payment_id` | `sub-pay-…` / `pay-…` | Our payment row id. |
| `tenant_id` | `tenant-…` | |
| `initiated_by` | `owner` / `member` / `admin` / `system` | Tenant owner, another tenant employee (campaign top-ups), or platform team. |
| `environment` | `production` / `development` | |
| `company_name`, `plan_id`, `plan_name`, `messages`, `gateway` | | When applicable. |

## Endpoints

### Customer-facing

| Method / path | Who | What |
| --- | --- | --- |
| `GET /billing` | tenant owner | Plan picker. Non-owners with an expired subscription see an "ask your owner" page. |
| `POST /api/billing/checkout` `{ planId }` | tenant owner (expired allowed) | Stages a `SubscriptionPayment` (pending, staged plan) and returns `{ paymentId }`. Reuses an existing pending row for the same plan; expires pending rows older than 1h. |
| `GET /billing/pay/[paymentId]` | tenant owner | Our own branded embedded checkout (Moyasar.js card form) for a staged `SubscriptionPayment`. |
| `POST /api/billing/confirm-payment` `{ paymentId, moyasarPaymentId }` | tenant owner | Re-fetches that Payment from Moyasar with our secret key and applies the outcome. Called by the embedded form's `on_completed` and, for 3-D Secure returns, by `/billing/success`. |
| `GET /billing/success?paymentId&id&kind` | | Landing page after checkout. With `paymentId`/`id` in the query (a 3-D Secure return that bypassed `on_completed`), re-runs the matching confirm route before showing anything as paid - never trusts the redirect alone. `kind` (`subscription` default, or `campaign_topup`) picks the copy and which confirm route to call. |
| `GET /billing/invoice/[id]` | any tenant user | Printable receipt for one payment (scoped to the tenant). |
| `GET /billing/invoices/print?from&to` | any tenant user | Printable statement. |
| `GET /api/campaigns/balance` | campaigns permission | `{ ok: true, data: { balance, lastTopUpAmount, transactions[] } }`. |
| `POST /api/campaigns/balance/charge` `{ messages }` | campaigns permission | Stages a `CampaignPayment` and returns `{ ok: true, data: { paymentId } }`. Price is computed server-side. |
| `GET /billing/pay/campaign/[paymentId]` | campaigns permission | Same embedded checkout as `/billing/pay/[paymentId]`, for a staged `CampaignPayment`. |
| `POST /api/campaigns/balance/confirm-payment` `{ paymentId, moyasarPaymentId }` | campaigns permission | Campaign-topup counterpart of `/api/billing/confirm-payment`. |

### Gateway callbacks

| Path | Source | Handler |
| --- | --- | --- |
| `POST /api/admin/subscriptions/payment-webhook` | Moyasar (`callback_url` of admin-created invoices; also usable as the dashboard "Payments Webhook") | `processMoyasarInvoiceWebhook("subscription")` |
| `POST /api/campaigns/payment-webhook` | Moyasar (dashboard "Payments Webhook" only now - self-serve top-ups no longer create an invoice with a `callback_url`) | `processMoyasarInvoiceWebhook("campaign_topup")` |
| `GET /api/admin/subscriptions/stripe-return?session_id&paymentId` | Stripe redirect (test mode only) | Looks the session up with our key; applies if `paid`. |

Both Moyasar webhooks share `lib/moyasar-webhook.ts`. Behaviour:

- a present-but-wrong `secret_token` is rejected with 401 (dashboard
  webhooks); the invoice `callback_url` shape carries no token and is not
  trusted either way;
- the body's own `status` is ignored; the invoice is re-fetched from Moyasar;
- a `paid` invoice whose amount differs from the staged row is **not**
  applied, and an `خطأ` admin-log entry is written;
- outcomes are recorded through one function so the webhook and the cron
  reconciler can never disagree.

### Platform admin

| Method / path | What |
| --- | --- |
| `GET /api/admin/subscriptions` | All subscriptions with seat/conversation counts and campaign balance. |
| `GET /api/admin/subscriptions/payments` | Every subscription payment and campaign top-up, newest first. |
| `POST /api/admin/subscriptions/charge` `{ tenantId, amount, gateway? }` | Creates a real payment link (Moyasar, or Stripe in test mode) for the admin to send to the client. Returns `{ ok: true, paymentUrl }`. The invoice carries no plan, so paying it renews the current plan. |
| `PATCH /api/admin/clients/[id]` `{ plan?, status?, employeeLimit?, amount?, billingCycle?, renewalAt? }` | Manual subscription edit. Changing the plan pulls the plan's price/limit; changing a trial's plan graduates it to active with a fresh renewal date. |
| `POST /api/admin/clients/[id]/campaign-balance` `{ messages, amount? }` | Manual message credit, recorded as a completed `manual` payment. |
| `GET /api/cron/campaigns` (Bearer `CRON_SECRET`) | Runs campaign sending, automations and `reconcileStalePendingPayments`, trial reminders and low-balance alerts. |

Admin UI: `/linkly-admin007/payments` (ledger with status, gateway, method,
gateway ids, period, failure reason, CSV/Excel export), `/linkly-admin007/clients`
(charge / renew, manual plan change, manual balance), `/linkly-admin007/alerts`
(renewals due or overdue).

## What a confirmed payment changes in the database

Benefits are written in exactly two places in `lib/subscriptions.ts`:
`applyConfirmedSubscriptionPayment` (subscription) and
`applyConfirmedCampaignPayment` (message credits). Both are idempotent: each
row is claimed with a compare-and-swap on its status, so a redelivered
webhook or a double click can never double-renew or double-credit.

| Caller | Path |
| --- | --- |
| Moyasar webhooks and the cron reconciler | `applyVerifiedGatewayOutcome()`, which maps the verified invoice status and also records failures and refunds (`markPaymentOutcome`) |
| Embedded checkout confirm routes (`/api/billing/confirm-payment`, `/api/campaigns/balance/confirm-payment`) | Also `applyVerifiedGatewayOutcome()`, but for a directly-fetched Moyasar **Payment** rather than an invoice - called by `MoyasarPayForm`'s `on_completed` and, for out-of-band 3-D Secure returns, by `/billing/success` |
| Stripe test-mode return | `stripe-return` route, only for the session created for that payment and only when the amounts match |

Manual admin credits (`addManualCampaignBalance` in `lib/campaign-engine.ts`)
are the one exception: they write a completed `manual` payment row and add
the messages directly, without any gateway.

### Subscription payment → paid

`applyConfirmedSubscriptionPayment(paymentId, gatewayDetails)`:

| Table | Column | Set to |
| --- | --- | --- |
| `subscription_payments` | `status` | `مكتمل` |
| | `completed_at` | now |
| | `period_start`, `period_end` | the month this payment bought (see below) |
| | `gateway`, `gateway_status`, `gateway_payment_id`, `payment_method` | from the verified invoice (`moyasar`, `paid`, `pay_…`, e.g. `creditcard/mada`) |
| | `failure_reason`, `failed_at` | cleared |
| `subscriptions` (upserted) | `status` | `نشط` |
| | `renewal_at` | `period_end` (new paid-through date) |
| | `amount`, `billing_cycle` | paid SAR amount, `شهري` |
| | `plan`, `employee_limit` | from the staged plan whenever the payment carries one (every self-serve checkout). Renewing the same plan never lowers a limit raised by an admin. Admin-created invoices carry no plan and leave both unchanged. |

Period rule (`computeSubscriptionPeriod`): renewing the **same plan** while
still paid up starts the new month at the current `renewal_at`, so paying
early never loses days. A plan change, a trial conversion, a suspended
account or an overdue renewal starts today. Plan changes are immediate and
not prorated.

### Campaign top-up → paid

`applyConfirmedCampaignPayment(paymentId, gatewayDetails)`:

| Table | Column | Set to |
| --- | --- | --- |
| `campaign_payments` | `status`, `completed_at`, gateway columns | as above |
| `campaign_balances` (upserted) | `balance` | `+ messages` |
| | `last_top_up_amount` | `messages` (re-arms the 50% / 20% / 5% low-balance alerts) |

### Not paid

`markPaymentOutcome(kind, paymentId, outcome, details)`:

| Gateway invoice status | Row status | Notes |
| --- | --- | --- |
| `initiated`, `on_hold` | stays `قيد الانتظار` | transitional |
| `failed` | `فشل` | `failure_reason` holds the decline message, `failed_at` stamped |
| `canceled`, `expired`, `voided`, or pending > 24h with no answer | `منتهي الصلاحية` | |
| `refunded` (on a completed row) | `مسترد` | Benefits are **not** revoked automatically; an admin alert is logged for a human decision. |

Only pending rows can fail or expire; only completed rows can be refunded.

### Reading "has this tenant paid?"

`subscriptionPaymentState(subscription)` in `lib/payment-status.ts`:

| `subscriptions.status` | `renewal_at` | State |
| --- | --- | --- |
| `تجربة` | trial end | `trial` |
| `نشط` | in the future | `paid` |
| `نشط` | in the past | `overdue` |
| `متوقف` | | `suspended` |

Access control (`getSubscriptionAccess` in `lib/auth.ts`): an expired trial or
a suspended account is redirected to `/billing`. An **overdue active**
subscription is only locked out when `SUBSCRIPTION_GRACE_DAYS` is set and the
grace period has passed; unset (the default) keeps paying customers online
and merely flags them as overdue in the admin panel.

## Payment row columns (both payment tables)

| Column | Meaning |
| --- | --- |
| `status` | `قيد الانتظار` / `مكتمل` / `فشل` / `منتهي الصلاحية` / `مسترد` |
| `amount`, `amount_halalas` | SAR (legacy float) and exact halalas |
| `moyasar_id` | gateway invoice/session id: `inv_…` (Moyasar), `stripe_test_…`, `test_…` (dev simulator), `''` (manual) |
| `payment_url` | hosted payment page |
| `gateway` | `moyasar` / `stripe` / `manual` / `test` |
| `gateway_payment_id` | the payment attempt inside the invoice (`pay_…`) |
| `payment_method` | e.g. `creditcard/mada`, `applepay`, `stcpay`, `manual` |
| `gateway_status` | raw status from the gateway at last update |
| `failure_reason`, `failed_at` | decline reason and time |
| `initiated_by` | `owner` / `member` / `admin` / `system` |
| `metadata_json` | the metadata sent to the gateway (always `platform: Linkly`) |
| `created_at`, `completed_at` | ISO timestamps |
| subscription only: `plan_name`, `plan_employee_limit`, `period_start`, `period_end` | staged plan and the period bought |
| campaign only: `messages` | messages purchased |

## Configuration

| Variable | Where | Notes |
| --- | --- | --- |
| `MOYASAR_SECRET_KEY` | Secret Manager `linkly-prod` (already present) | `sk_test_…` sandbox, `sk_live_…` live. `isMoyasarLiveMode()` drives the "test mode" notice on `/billing`. |
| `NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY` | Cloud Build trigger **substitution**, not Secret Manager and not a Cloud Run env var - `pk_test_…`/`pk_live_…`, safe to expose client-side by design. Powers the embedded card form (`MoyasarPayForm`). Next.js inlines `NEXT_PUBLIC_*` at *build* time, so it must be set as the `_MOYASAR_PUBLISHABLE_KEY` substitution on the `linkly-deploy-on-push` trigger (Cloud Build → Triggers → edit → Substitution variables) - a value only passed to a one-off manual "Run" does **not** persist and gets lost on the next automatic push-triggered build. | Missing/empty → `/billing/pay/[paymentId]` and `/billing/pay/campaign/[paymentId]` show "بوابة الدفع غير مهيأة حاليًا" instead of the card form. |
| `MOYASAR_WEBHOOK_SECRET` | Secret Manager (already present) | Must equal the secret entered on the Moyasar dashboard's Payments Webhook. |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | Cloud Run env | Public origin used for Moyasar `callback_url`, `success_url` and `back_url` (`getPaymentCallbackOrigin` in `lib/app-url.ts`). Never taken from the incoming request. If unset: `https://linklysa.io` in production, `http://localhost:3000` in development. Set it explicitly for any other domain. |
| `CRON_SECRET` | Secret Manager (already present) | Bearer token for `/api/cron/campaigns`. |
| `SUBSCRIPTION_GRACE_DAYS` | optional | See access control above. |
| `STRIPE_SECRET_KEY` | optional | Test-mode alternate gateway for admin invoices only. |

### Moyasar dashboard

1. Payments Webhooks (optional but recommended as a second signal): URL
   `https://linklysa.io/api/admin/subscriptions/payment-webhook`, events
   `payment_paid`, `payment_failed`, `payment_refunded`, secret =
   `MOYASAR_WEBHOOK_SECRET`. Campaign invoices are matched by invoice id, so
   the campaign webhook URL can be added as well, or this single URL can be
   left to answer "unknown invoice" for the other kind (it does, harmlessly).
2. Nothing else is required: every invoice already carries its own
   `callback_url`.

### Cloud Scheduler for the reconciler

`/api/cron/campaigns` is what re-checks pending payments, sends trial-ending
reminders and low-balance alerts. At the time of writing the only Cloud
Scheduler job in `linkly-prod` targets `/api/cron/youtube-comments`. Create
one for campaigns (every 5 minutes is fine):

```sh
gcloud scheduler jobs create http linkly-campaigns-cron \
  --project linkly-prod --location me-central2 \
  --schedule "*/5 * * * *" \
  --uri "https://linklysa.io/api/cron/campaigns" \
  --http-method GET \
  --headers "Authorization=Bearer <value of CRON_SECRET>"
```

## Local development

Without `MOYASAR_SECRET_KEY`, checkout just returns "بوابة الدفع غير مهيأة
حاليًا" - there is no simulated/dev-only payment path, so a `sk_test_…` key
is required locally to exercise checkout at all. With one set, real Moyasar
sandbox invoices are created. Use Moyasar's test cards and expose your dev
server through a tunnel set as `APP_URL`, so the webhook can reach you.
Without a tunnel nothing activates the payment in practice: the reconciler
only re-checks rows that have been pending for more than 24 hours, and only
when `/api/cron/campaigns` is called with the `CRON_SECRET` bearer token,
which nothing schedules locally.

Production database access, the payment-ledger migration and the
`npm run db:*` commands are described in
[database-access.md](database-access.md).

Tests: `tests/payments-ledger.test.ts` (metadata, status mapping, period
math, ledger writes, webhook processing with a mocked Moyasar API, grace
period) and `tests/business-logic.test.ts` (payment gating).
