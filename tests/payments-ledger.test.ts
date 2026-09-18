import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-payments-ledger.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("MOYASAR_SECRET_KEY", "sk_test_unit");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("payment request metadata", () => {
  it("stamps every payment request with the platform name Linkly and traceable ids", async () => {
    const { buildPaymentMetadata, PAYMENT_PLATFORM_NAME } = await import("../lib/moyasar");
    const metadata = buildPaymentMetadata({
      kind: "subscription",
      tenantId: "tenant-abc",
      paymentId: "sub-pay-1",
      initiatedBy: "owner",
      companyName: "شركة الاختبار",
      planId: "plan-growth",
      planName: "باقة النمو",
      gateway: "moyasar"
    });

    expect(PAYMENT_PLATFORM_NAME).toBe("Linkly");
    expect(metadata.platform).toBe("Linkly");
    expect(metadata.product).toContain("Linkly");
    expect(metadata).toMatchObject({
      payment_kind: "subscription",
      payment_id: "sub-pay-1",
      tenant_id: "tenant-abc",
      initiated_by: "owner",
      plan_id: "plan-growth",
      plan_name: "باقة النمو",
      company_name: "شركة الاختبار",
      gateway: "moyasar"
    });
    for (const value of Object.values(metadata)) expect(typeof value).toBe("string");
  });

  it("includes the message count for campaign top-ups and bounds long values", async () => {
    const { buildPaymentMetadata } = await import("../lib/moyasar");
    const metadata = buildPaymentMetadata({
      kind: "campaign_topup",
      tenantId: "tenant-abc",
      paymentId: "pay-1",
      initiatedBy: "owner",
      companyName: "x".repeat(500),
      messages: 5000
    });
    expect(metadata.platform).toBe("Linkly");
    expect(metadata.messages).toBe("5000");
    expect(metadata.company_name.length).toBeLessThanOrEqual(80);
  });

  it("sends platform: Linkly to Moyasar even when a caller passes metadata without it", async () => {
    const { createMoyasarInvoice } = await import("../lib/moyasar");
    let sentBody: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "inv_1", status: "initiated", url: "https://pay.example/inv_1" }), { status: 201 });
    }));

    await createMoyasarInvoice({ amount: 10, description: "x", callbackUrl: "https://app.example/cb", metadata: { foo: "bar" } });
    expect(sentBody).not.toBeNull();
    expect((sentBody as unknown as { metadata: Record<string, string> }).metadata).toMatchObject({ platform: "Linkly", foo: "bar" });
    expect((sentBody as unknown as { amount: number; currency: string })).toMatchObject({ amount: 1000, currency: "SAR" });
  });
});

describe("Moyasar status mapping and invoice summary", () => {
  it("maps gateway invoice statuses onto our ledger outcomes", async () => {
    const { mapMoyasarInvoiceStatus } = await import("../lib/payment-status");
    expect(mapMoyasarInvoiceStatus("paid")).toBe("completed");
    expect(mapMoyasarInvoiceStatus("failed")).toBe("failed");
    expect(mapMoyasarInvoiceStatus("refunded")).toBe("refunded");
    expect(mapMoyasarInvoiceStatus("canceled")).toBe("expired");
    expect(mapMoyasarInvoiceStatus("expired")).toBe("expired");
    expect(mapMoyasarInvoiceStatus("voided")).toBe("expired");
    expect(mapMoyasarInvoiceStatus("initiated")).toBeNull();
    expect(mapMoyasarInvoiceStatus("on_hold")).toBeNull();
    expect(mapMoyasarInvoiceStatus(undefined)).toBeNull();
  });

  it("summarizes the decisive payment attempt without any card data", async () => {
    const { summarizeMoyasarInvoice } = await import("../lib/moyasar");
    const summary = summarizeMoyasarInvoice({
      id: "inv_1",
      status: "paid",
      amount: 49900,
      currency: "SAR",
      metadata: {},
      payments: [
        { id: "pay_failed", status: "failed", amount: 49900, sourceType: "creditcard", sourceCompany: "visa", message: "DECLINED", createdAt: "2026-09-16T10:00:00Z" },
        { id: "pay_ok", status: "paid", amount: 49900, sourceType: "creditcard", sourceCompany: "mada", message: "APPROVED", createdAt: "2026-09-16T10:05:00Z" }
      ]
    });
    expect(summary).toEqual({ gateway: "moyasar", gatewayStatus: "paid", gatewayPaymentId: "pay_ok", paymentMethod: "creditcard/mada", failureReason: "" });
  });

  it("keeps the decline reason when the invoice failed", async () => {
    const { summarizeMoyasarInvoice } = await import("../lib/moyasar");
    const summary = summarizeMoyasarInvoice({
      id: "inv_2",
      status: "failed",
      amount: 100,
      currency: "SAR",
      metadata: {},
      payments: [{ id: "pay_x", status: "failed", amount: 100, sourceType: "creditcard", sourceCompany: "visa", message: "INSUFFICIENT_FUNDS", createdAt: "" }]
    });
    expect(summary.failureReason).toBe("INSUFFICIENT_FUNDS");
    expect(summary.gatewayPaymentId).toBe("pay_x");
  });

  it("derives paid / overdue / trial / suspended from the subscription row", async () => {
    const { subscriptionPaymentState } = await import("../lib/payment-status");
    const now = Date.parse("2026-09-16T12:00:00Z");
    expect(subscriptionPaymentState({ status: "نشط", renewalAt: "2026-10-01" }, now)).toBe("paid");
    expect(subscriptionPaymentState({ status: "نشط", renewalAt: "2026-09-01" }, now)).toBe("overdue");
    expect(subscriptionPaymentState({ status: "تجربة", renewalAt: "2026-09-18" }, now)).toBe("trial");
    expect(subscriptionPaymentState({ status: "متوقف", renewalAt: "" }, now)).toBe("suspended");
    expect(subscriptionPaymentState(null, now)).toBe("unknown");
  });
});

describe("subscription renewal period", () => {
  it("extends from the current paid-through date when renewing the same plan early", async () => {
    const { computeSubscriptionPeriod } = await import("../lib/subscriptions");
    const period = computeSubscriptionPeriod({
      now: new Date("2026-09-16T12:00:00Z"),
      currentStatus: "نشط",
      currentPlan: "باقة النمو",
      currentRenewalAt: "2026-09-25",
      stagedPlanName: ""
    });
    expect(period).toEqual({ periodStart: "2026-09-25", periodEnd: "2026-10-25", extendedFromCurrent: true });
  });

  it("starts today for a plan change, an overdue renewal, or a trial conversion", async () => {
    const { computeSubscriptionPeriod } = await import("../lib/subscriptions");
    const now = new Date("2026-09-16T12:00:00Z");
    expect(computeSubscriptionPeriod({ now, currentStatus: "نشط", currentPlan: "باقة البداية", currentRenewalAt: "2026-09-25", stagedPlanName: "باقة النمو" }))
      .toEqual({ periodStart: "2026-09-16", periodEnd: "2026-10-16", extendedFromCurrent: false });
    expect(computeSubscriptionPeriod({ now, currentStatus: "نشط", currentPlan: "باقة النمو", currentRenewalAt: "2026-09-01", stagedPlanName: "" }).periodStart).toBe("2026-09-16");
    expect(computeSubscriptionPeriod({ now, currentStatus: "تجربة", currentPlan: "باقة البداية", currentRenewalAt: "2026-09-18", stagedPlanName: "باقة البداية" }).periodStart).toBe("2026-09-16");
  });

  it("clamps month-end overflow", async () => {
    const { computeSubscriptionPeriod } = await import("../lib/subscriptions");
    expect(computeSubscriptionPeriod({ now: new Date("2026-01-31T12:00:00Z") }).periodEnd).toBe("2026-02-28");
  });
});

describe("payment ledger writes", () => {
  it("records period, gateway details and the subscription's last payment on confirmation", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantId = "tenant-ledger-renewal";
    const now = new Date().toISOString();
    const paidThrough = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await prisma.subscription.create({
      data: { id: `sub-${tenantId}`, tenantId, companyName: "Ledger Co", ownerName: "Owner", ownerEmail: "owner@ledger.example", plan: "باقة النمو", status: "نشط", employeeLimit: 3, amount: 499, billingCycle: "شهري", renewalAt: paidThrough, createdAt: now, updatedAt: now }
    });
    await prisma.subscriptionPayment.create({
      data: { id: `pay-${tenantId}`, tenantId, amount: 499, amountHalalas: 49900, status: "قيد الانتظار", moyasarId: "inv_renewal", paymentUrl: "", createdAt: now, gateway: "moyasar", initiatedBy: "owner", metadataJson: JSON.stringify({ platform: "Linkly" }) }
    });

    const result = await applyConfirmedSubscriptionPayment(`pay-${tenantId}`, { gateway: "moyasar", gatewayStatus: "paid", gatewayPaymentId: "pay_123", paymentMethod: "creditcard/mada" });
    expect(result.activated).toBe(true);
    // Same plan, still paid up -> the new month starts where the old one ended.
    expect(result.periodStart).toBe(paidThrough);

    const payment = await prisma.subscriptionPayment.findUnique({ where: { id: `pay-${tenantId}` } });
    expect(payment).toMatchObject({ status: "مكتمل", gateway: "moyasar", gatewayStatus: "paid", gatewayPaymentId: "pay_123", paymentMethod: "creditcard/mada", periodStart: paidThrough });
    expect((payment?.periodEnd ?? "") > paidThrough).toBe(true);
    expect(payment?.completedAt).not.toBe("");

    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    expect(subscription).toMatchObject({ status: "نشط", renewalAt: payment?.periodEnd });
  });

  it("keeps an admin-raised employee limit on a same-plan renewal but applies a plan change exactly", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantId = "tenant-ledger-custom-limit";
    const now = new Date().toISOString();
    await prisma.subscription.create({
      data: { id: `sub-${tenantId}`, tenantId, companyName: "Limit Co", ownerName: "Owner", ownerEmail: "limit@ledger.example", plan: "باقة النمو", status: "نشط", employeeLimit: 12, amount: 499, billingCycle: "شهري", renewalAt: "", createdAt: now, updatedAt: now }
    });
    await prisma.subscriptionPayment.create({
      data: { id: `pay-same-${tenantId}`, tenantId, amount: 499, amountHalalas: 49900, status: "قيد الانتظار", moyasarId: "inv_same", paymentUrl: "", createdAt: now, planName: "باقة النمو", planEmployeeLimit: 3 }
    });
    await applyConfirmedSubscriptionPayment(`pay-same-${tenantId}`);
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({ plan: "باقة النمو", employeeLimit: 12 });

    await prisma.subscriptionPayment.create({
      data: { id: `pay-change-${tenantId}`, tenantId, amount: 999, amountHalalas: 99900, status: "قيد الانتظار", moyasarId: "inv_change", paymentUrl: "", createdAt: now, planName: "باقة الأعمال", planEmployeeLimit: 10 }
    });
    await applyConfirmedSubscriptionPayment(`pay-change-${tenantId}`);
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({ plan: "باقة الأعمال", employeeLimit: 10 });
  });

  it("credits campaign messages exactly once and arms the low-balance baseline", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { applyConfirmedCampaignPayment } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantId = "tenant-ledger-topup";
    await prisma.campaignBalance.create({ data: { tenantId, balance: 120, lastTopUpAmount: 0, updatedAt: new Date().toISOString() } });
    await prisma.campaignPayment.create({
      data: { id: `pay-${tenantId}`, tenantId, messages: 5000, amount: 150, amountHalalas: 15000, status: "قيد الانتظار", moyasarId: "inv_topup", paymentUrl: "", createdAt: new Date().toISOString() }
    });

    const first = await applyConfirmedCampaignPayment(`pay-${tenantId}`, { gateway: "moyasar", gatewayStatus: "paid", gatewayPaymentId: "pay_t", paymentMethod: "applepay" });
    expect(first).toEqual({ credited: true, messages: 5000 });
    const second = await applyConfirmedCampaignPayment(`pay-${tenantId}`);
    expect(second.credited).toBe(false);

    const balance = await prisma.campaignBalance.findUnique({ where: { tenantId } });
    expect(balance).toMatchObject({ balance: 5120, lastTopUpAmount: 5000 });
    const payment = await prisma.campaignPayment.findUnique({ where: { id: `pay-${tenantId}` } });
    expect(payment).toMatchObject({ status: "مكتمل", gateway: "moyasar", gatewayPaymentId: "pay_t", paymentMethod: "applepay" });
  });

  it("marks failed and expired outcomes only on pending rows, refunds only on completed rows", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { markPaymentOutcome, applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantId = "tenant-ledger-outcomes";
    const now = new Date().toISOString();
    await prisma.userAccount.create({ data: { id: `user-${tenantId}`, name: "Outcome Owner", email: "outcome@ledger.example", passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now } });
    await prisma.subscriptionPayment.create({ data: { id: `pay-fail-${tenantId}`, tenantId, amount: 249, amountHalalas: 24900, status: "قيد الانتظار", moyasarId: "inv_fail", paymentUrl: "", createdAt: now } });
    await prisma.subscriptionPayment.create({ data: { id: `pay-ok-${tenantId}`, tenantId, amount: 249, amountHalalas: 24900, status: "قيد الانتظار", moyasarId: "inv_ok", paymentUrl: "", createdAt: now, planName: "باقة البداية", planEmployeeLimit: 1 } });

    expect((await markPaymentOutcome("subscription", `pay-fail-${tenantId}`, "failed", { gatewayStatus: "failed", failureReason: "DECLINED" })).changed).toBe(true);
    const failed = await prisma.subscriptionPayment.findUnique({ where: { id: `pay-fail-${tenantId}` } });
    expect(failed).toMatchObject({ status: "فشل", gatewayStatus: "failed", failureReason: "DECLINED" });
    expect(failed?.failedAt).not.toBe("");
    // A failed row can't be refunded (it was never completed).
    expect((await markPaymentOutcome("subscription", `pay-fail-${tenantId}`, "refunded")).changed).toBe(false);

    await applyConfirmedSubscriptionPayment(`pay-ok-${tenantId}`, { gateway: "moyasar" });
    // A completed row can't retroactively fail or expire...
    expect((await markPaymentOutcome("subscription", `pay-ok-${tenantId}`, "failed")).changed).toBe(false);
    expect((await markPaymentOutcome("subscription", `pay-ok-${tenantId}`, "expired")).changed).toBe(false);
    // ...but it can be refunded, which raises an admin alert instead of revoking access.
    expect((await markPaymentOutcome("subscription", `pay-ok-${tenantId}`, "refunded", { gatewayStatus: "refunded" })).changed).toBe(true);
    expect((await prisma.subscriptionPayment.findUnique({ where: { id: `pay-ok-${tenantId}` } }))?.status).toBe("مسترد");
    expect((await prisma.subscription.findUnique({ where: { tenantId } }))?.status).toBe("نشط");
    const alert = await prisma.adminLog.findFirst({ where: { clientId: tenantId, level: "تنبيه" } });
    expect(alert?.message).toContain("استرداد");
  });

  it("stores manual admin top-ups with a manual gateway", async () => {
    const { prisma } = await import("../lib/prisma");
    const { addManualCampaignBalance } = await import("../lib/campaign-engine");
    const payment = await addManualCampaignBalance("tenant-ledger-manual", 2000, 60);
    expect(payment).toMatchObject({ status: "مكتمل", gateway: "manual", initiatedBy: "admin", amountHalalas: 6000 });
    expect(await prisma.campaignBalance.findUnique({ where: { tenantId: "tenant-ledger-manual" } })).toMatchObject({ balance: 2000, lastTopUpAmount: 2000 });
  });
});

describe("Moyasar webhook processing", () => {
  function mockInvoiceFetch(invoice: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(invoice), { status: 200 })));
  }

  it("activates the subscription only after re-fetching a paid invoice whose amount matches", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { processMoyasarInvoiceWebhook } = await import("../lib/moyasar-webhook");
    await ensureSchema();

    const tenantId = "tenant-webhook-paid";
    const now = new Date().toISOString();
    await prisma.userAccount.create({ data: { id: `user-${tenantId}`, name: "Webhook Owner", email: "webhook@ledger.example", passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now } });
    await prisma.subscriptionPayment.create({ data: { id: `pay-${tenantId}`, tenantId, amount: 499, amountHalalas: 49900, status: "قيد الانتظار", moyasarId: "inv_wh_paid", paymentUrl: "", createdAt: now, planName: "باقة النمو", planEmployeeLimit: 3 } });

    // Webhook body claims "paid" but the ledger must only trust the re-fetch.
    mockInvoiceFetch({ id: "inv_wh_paid", status: "initiated", amount: 49900, currency: "SAR", payments: [] });
    let result = await processMoyasarInvoiceWebhook("subscription", { id: "inv_wh_paid", status: "paid" });
    expect(result.body).toMatchObject({ skipped: true, reason: "not_final" });
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toBeNull();

    mockInvoiceFetch({ id: "inv_wh_paid", status: "paid", amount: 49900, currency: "SAR", payments: [{ id: "pay_wh", status: "paid", amount: 49900, source: { type: "creditcard", company: "mada", message: "APPROVED" } }] });
    result = await processMoyasarInvoiceWebhook("subscription", { type: "payment_paid", data: { id: "pay_wh", invoice_id: "inv_wh_paid" } });
    expect(result).toMatchObject({ httpStatus: 200, body: { ok: true, outcome: "completed" } });
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({ status: "نشط", plan: "باقة النمو", employeeLimit: 3 });
    expect(await prisma.subscriptionPayment.findUnique({ where: { id: `pay-${tenantId}` } })).toMatchObject({ status: "مكتمل", gatewayPaymentId: "pay_wh", paymentMethod: "creditcard/mada" });

    // Redelivery is a no-op.
    result = await processMoyasarInvoiceWebhook("subscription", { id: "inv_wh_paid" });
    expect(result.body).toMatchObject({ alreadyProcessed: true });
  });

  it("refuses to activate a paid invoice whose amount does not match the staged payment", async () => {
    const { prisma } = await import("../lib/prisma");
    const { processMoyasarInvoiceWebhook } = await import("../lib/moyasar-webhook");

    const tenantId = "tenant-webhook-mismatch";
    await prisma.subscriptionPayment.create({ data: { id: `pay-${tenantId}`, tenantId, amount: 499, amountHalalas: 49900, status: "قيد الانتظار", moyasarId: "inv_wh_mismatch", paymentUrl: "", createdAt: new Date().toISOString(), planName: "باقة النمو", planEmployeeLimit: 3 } });
    mockInvoiceFetch({ id: "inv_wh_mismatch", status: "paid", amount: 100, currency: "SAR", payments: [] });

    const result = await processMoyasarInvoiceWebhook("subscription", { id: "inv_wh_mismatch" });
    expect(result.body).toMatchObject({ skipped: true, reason: "amount_mismatch" });
    expect((await prisma.subscriptionPayment.findUnique({ where: { id: `pay-${tenantId}` } }))?.status).toBe("قيد الانتظار");
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toBeNull();
    expect(await prisma.adminLog.findFirst({ where: { clientId: tenantId, level: "خطأ" } })).not.toBeNull();
  });

  it("credits campaign messages from a paid top-up invoice and records failures", async () => {
    const { prisma } = await import("../lib/prisma");
    const { processMoyasarInvoiceWebhook } = await import("../lib/moyasar-webhook");

    const tenantId = "tenant-webhook-topup";
    const now = new Date().toISOString();
    await prisma.campaignPayment.create({ data: { id: `pay-a-${tenantId}`, tenantId, messages: 1000, amount: 30, amountHalalas: 3000, status: "قيد الانتظار", moyasarId: "inv_wh_topup", paymentUrl: "", createdAt: now } });
    await prisma.campaignPayment.create({ data: { id: `pay-b-${tenantId}`, tenantId, messages: 1000, amount: 30, amountHalalas: 3000, status: "قيد الانتظار", moyasarId: "inv_wh_topup_failed", paymentUrl: "", createdAt: now } });

    mockInvoiceFetch({ id: "inv_wh_topup", status: "paid", amount: 3000, currency: "SAR", payments: [{ id: "pay_c", status: "paid", amount: 3000, source: { type: "stcpay", message: "APPROVED" } }] });
    expect((await processMoyasarInvoiceWebhook("campaign_topup", { id: "inv_wh_topup" })).body).toMatchObject({ ok: true, outcome: "completed" });
    expect(await prisma.campaignBalance.findUnique({ where: { tenantId } })).toMatchObject({ balance: 1000, lastTopUpAmount: 1000 });

    mockInvoiceFetch({ id: "inv_wh_topup_failed", status: "failed", amount: 3000, currency: "SAR", payments: [{ id: "pay_d", status: "failed", amount: 3000, source: { type: "creditcard", company: "visa", message: "3-D Secure failed" } }] });
    expect((await processMoyasarInvoiceWebhook("campaign_topup", { id: "inv_wh_topup_failed" })).body).toMatchObject({ ok: true, outcome: "failed" });
    expect(await prisma.campaignPayment.findUnique({ where: { id: `pay-b-${tenantId}` } })).toMatchObject({ status: "فشل", failureReason: "3-D Secure failed", gatewayPaymentId: "pay_d" });
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance).toBe(1000);
  });

  it("rejects a present-but-wrong secret_token and ignores unknown invoices", async () => {
    const { processMoyasarInvoiceWebhook } = await import("../lib/moyasar-webhook");
    vi.stubEnv("MOYASAR_WEBHOOK_SECRET", "expected-secret");
    expect((await processMoyasarInvoiceWebhook("subscription", { secret_token: "wrong", id: "inv_x" })).httpStatus).toBe(401);
    expect((await processMoyasarInvoiceWebhook("subscription", { id: "inv_does_not_exist" })).body).toMatchObject({ skipped: true, reason: "unknown_invoice" });
    expect((await processMoyasarInvoiceWebhook("subscription", {})).body).toMatchObject({ skipped: true, reason: "no_invoice_id" });
  });
});

describe("stale pending payment reconciliation", () => {
  function mockInvoiceMissPaymentHit(payment: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/v1/invoices/")) return new Response("Not Found", { status: 404 });
      return new Response(JSON.stringify(payment), { status: 200 });
    }));
  }

  it("falls back to a direct Payment lookup when a stale row's moyasarId is a Payment id, not an invoice id", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { reconcileStalePendingPayments } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantId = "tenant-reconcile-embedded";
    const now = new Date().toISOString();
    // The embedded checkout (app/api/billing/confirm-payment) writes the raw
    // Moyasar Payment id straight into moyasarId as soon as on_completed
    // fires - even for a row still pending an out-of-band 3-D-Secure return.
    // A stale sweep must not treat a 404 on the INVOICE endpoint as proof
    // the payment doesn't exist.
    const staleCreatedAt = new Date(Date.now() - 25 * 3_600_000).toISOString();
    await prisma.userAccount.create({ data: { id: `user-${tenantId}`, name: "Reconcile Owner", email: "reconcile@ledger.example", passwordHash: "x", role: "مالك الحساب", tenantId, createdAt: now } });
    await prisma.subscriptionPayment.create({
      data: { id: `pay-${tenantId}`, tenantId, amount: 499, amountHalalas: 49900, status: "قيد الانتظار", moyasarId: "pay_embedded_3ds", paymentUrl: "", createdAt: staleCreatedAt, planName: "باقة النمو", planEmployeeLimit: 3 }
    });

    mockInvoiceMissPaymentHit({ id: "pay_embedded_3ds", status: "paid", amount: 49900, currency: "SAR", source: { type: "creditcard", company: "mada", message: "APPROVED" } });

    const result = await reconcileStalePendingPayments(24 * 3_600_000);
    expect(result.reconciled).toBe(1);
    expect(await prisma.subscriptionPayment.findUnique({ where: { id: `pay-${tenantId}` } })).toMatchObject({ status: "مكتمل", gatewayPaymentId: "pay_embedded_3ds", paymentMethod: "creditcard/mada" });
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({ status: "نشط", plan: "باقة النمو" });
  });

  it("expires a stale row when neither the invoice nor the Payment endpoint knows it", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { reconcileStalePendingPayments } = await import("../lib/subscriptions");
    await ensureSchema();

    const tenantId = "tenant-reconcile-abandoned";
    const staleCreatedAt = new Date(Date.now() - 25 * 3_600_000).toISOString();
    await prisma.subscriptionPayment.create({
      data: { id: `pay-${tenantId}`, tenantId, amount: 499, amountHalalas: 49900, status: "قيد الانتظار", moyasarId: "pay_never_attempted", paymentUrl: "", createdAt: staleCreatedAt }
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not Found", { status: 404 })));

    const result = await reconcileStalePendingPayments(24 * 3_600_000);
    expect(result.expired).toBe(1);
    expect((await prisma.subscriptionPayment.findUnique({ where: { id: `pay-${tenantId}` } }))?.status).toBe("منتهي الصلاحية");
  });
});

describe("payment callback origin", () => {
  it("never derives gateway URLs from the request and falls back per environment", async () => {
    const { getPaymentCallbackOrigin } = await import("../lib/app-url");
    vi.stubEnv("APP_URL", "https://pay.example.com/");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getPaymentCallbackOrigin()).toBe("https://pay.example.com");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(getPaymentCallbackOrigin()).toBe("https://linklysa.io");
    vi.stubEnv("NODE_ENV", "development");
    expect(getPaymentCallbackOrigin()).toBe("http://localhost:3000");
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "test");
  });
});

describe("subscription access grace period", () => {
  it("locks an overdue active subscription only when SUBSCRIPTION_GRACE_DAYS is set and exceeded", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    const { getSubscriptionAccess } = await import("../lib/auth");
    await ensureSchema();

    const tenantId = "tenant-grace";
    const now = new Date().toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    await prisma.subscription.create({ data: { id: `sub-${tenantId}`, tenantId, companyName: "Grace Co", ownerName: "Owner", ownerEmail: "grace@ledger.example", plan: "باقة النمو", status: "نشط", employeeLimit: 3, amount: 499, billingCycle: "شهري", renewalAt: tenDaysAgo, createdAt: now, updatedAt: now } });

    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "");
    expect(await getSubscriptionAccess(tenantId)).toMatchObject({ expired: false, overdue: true });
    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "30");
    expect(await getSubscriptionAccess(tenantId)).toMatchObject({ expired: false, overdue: true });
    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "7");
    expect(await getSubscriptionAccess(tenantId)).toMatchObject({ expired: true, overdue: true });
    vi.stubEnv("SUBSCRIPTION_GRACE_DAYS", "");
  });
});
