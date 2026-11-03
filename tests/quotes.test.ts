import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-quotes.db");
let admin: { id: string; email: string; name: string } | null = { id: "adm-1", email: "admin@example.com", name: "مدير المنصة" };

vi.mock("../lib/admin-auth", () => ({ requirePlatformAdmin: async () => admin }));
vi.mock("../lib/origin-guard", () => ({ isTrustedOrigin: () => true }));
vi.mock("../lib/admin-audit", () => ({ recordAdminAction: async () => undefined }));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  vi.stubEnv("GEMINI_API_KEY", "");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${testDbPath}${suffix}`)) unlinkSync(`${testDbPath}${suffix}`);
});

describe("the rules", () => {
  it("adds up like the quotation sent to ELCT: 25,500 + 15% VAT = 29,325", async () => {
    const { quoteTotals, formatSar } = await import("../lib/quotes/model");
    const totals = quoteTotals([
      { quantity: 1, unitPriceHalalas: 2_250_000, vatRate: 15 },
      { quantity: 1, unitPriceHalalas: 240_000, vatRate: 15 },
      { quantity: 1, unitPriceHalalas: 60_000, vatRate: 15 }
    ]);
    expect(totals).toEqual({ subtotalHalalas: 2_550_000, vatHalalas: 382_500, totalHalalas: 2_932_500 });
    expect(formatSar(totals.totalHalalas)).toBe("29,325");
    expect(formatSar(12_345)).toBe("123.45");
  });

  it("suggests the messages price from what was filled in, and writes the line's texts", async () => {
    const { DEFAULT_QUOTE_SERVICES, lineFromService, defaultFieldValues } = await import("../lib/quotes/model");
    const service = { ...DEFAULT_QUOTE_SERVICES[0], id: "s1", position: 0, active: true };
    const line = lineFromService(service, defaultFieldValues(service));
    expect(line.unitPriceHalalas).toBe(2_250_000); // 75,000 x (0.216 + 0.084) SAR
    expect(line.name).toBe("رسائل واتساب ترويجية إلى 75,000 رقم");
    expect(line.description).toBe("رسوم ميتا: 0.216 ريال للرسالة · خدمة لنكلي: 0.084 ريال للرسالة");
    expect(lineFromService(service, { messages: "10000", meta_fee: "0.2", linkly_fee: "0.1" }).unitPriceHalalas).toBe(300_000);
  });

  it("lets only the right person move a quote on", async () => {
    const { adminCanMove, clientCanAnswer, isExpired, addDays } = await import("../lib/quotes/model");
    expect(adminCanMove("draft", "sent")).toBe(true);
    expect(adminCanMove("needs_changes", "draft")).toBe(true);
    expect(adminCanMove("approved", "cancelled")).toBe(false);
    expect(adminCanMove("sent", "approved")).toBe(false); // only the client approves
    expect(clientCanAnswer("sent", "2099-01-01")).toBe(true);
    expect(clientCanAnswer("draft", "2099-01-01")).toBe(false);
    expect(clientCanAnswer("sent", "2020-01-01")).toBe(false);
    expect(isExpired("2026-11-02", new Date("2026-11-02T20:59:00Z"))).toBe(false); // still the 2nd in Riyadh
    expect(isExpired("2026-11-02", new Date("2026-11-02T21:01:00Z"))).toBe(true);
    expect(addDays("2026-11-02", 7)).toBe("2026-11-09");
  });

  it("builds terms from the services' notes without repeats", async () => {
    const { DEFAULT_QUOTE_SERVICES, termsForLines, lineFromService, defaultFieldValues } = await import("../lib/quotes/model");
    const services = DEFAULT_QUOTE_SERVICES.map((service, index) => ({ ...service, id: `s${index}`, position: index, active: true }));
    const lines = services.map((service) => lineFromService(service, defaultFieldValues(service)));
    const terms = termsForLines(services, lines);
    expect(terms[0]).toContain("75,000");
    expect(terms.at(-1)).toContain("الفاتورة الضريبية");
    expect(new Set(terms).size).toBe(terms.length);
  });
});

const body = (overrides: Record<string, unknown> = {}) => ({
  customerName: "ELECT", contactName: "ماجد", email: "client@example.com", phone: "0555123456", vatNumber: "312152534500003", address: "الدمام",
  billingCycle: "سنوي", validityDays: 7, eyebrow: "حملة", headline: "عنوان", subtitle: "وصف", terms: ["شرط"], paymentTerms: "سداد فوري", planName: "باقة اختبار العروض",
  lines: [{ serviceId: "s1", name: "رسائل واتساب ترويجية", description: "وصف", quantity: 1, unitPriceHalalas: 2_250_000, vatRate: 15, fields: { messages: "75000" } }],
  ...overrides
});

const json = (url: string, method: string, payload?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload) });

describe("quotations through the API", () => {
  it("creates, edits while it is a draft, sends with a link, and the client answers once", async () => {
    const list = await import("../app/api/admin/quotes/route");
    const one = await import("../app/api/admin/quotes/[id]/route");
    const send = await import("../app/api/admin/quotes/[id]/send/route");
    const answer = await import("../app/api/quotes/answer/[token]/route");
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

    const created = await (await list.POST(json("/api/admin/quotes", "POST", body()))).json();
    expect(created.data).toMatchObject({ number: "Q-00001", status: "draft", subtotalHalalas: 2_250_000, vatHalalas: 337_500, totalHalalas: 2_587_500, salesperson: "مدير المنصة" });
    const id = created.data.id as string;

    // The totals come from the lines on the server, never from the browser.
    const edited = await (await one.PUT(json(`/api/admin/quotes/${id}`, "PUT", body({ lines: [{ ...body().lines[0], quantity: 2, unitPriceHalalas: 100_000 }] })), ctx(id))).json();
    expect(edited.data).toMatchObject({ subtotalHalalas: 200_000, vatHalalas: 30_000, totalHalalas: 230_000 });

    const sent = await (await send.POST(json(`/api/admin/quotes/${id}/send`, "POST"), ctx(id))).json();
    expect(sent.data.url).toMatch(/\/q\/[A-Za-z0-9_-]{40,}$/);
    expect(sent.data.quote.status).toBe("sent");
    const token = sent.data.url.split("/q/")[1] as string;

    // A sent quote can no longer be edited or sent again.
    expect((await one.PUT(json(`/api/admin/quotes/${id}`, "PUT", body()), ctx(id))).status).toBe(409);
    expect((await send.POST(json(`/api/admin/quotes/${id}/send`, "POST"), ctx(id))).status).toBe(409);

    const answerCtx = (value: string) => ({ params: Promise.resolve({ token: value }) });
    expect((await answer.POST(json("/x", "POST", { answer: "approve" }), answerCtx("not-a-real-token-not-a-real-token-123456"))).status).toBe(404);
    expect((await answer.POST(json("/x", "POST", { answer: "maybe" }), answerCtx(token))).status).toBe(400);
    expect((await answer.POST(json("/x", "POST", { answer: "request_changes", note: "" }), answerCtx(token))).status).toBe(400);
    const approved = await answer.POST(json("/x", "POST", { answer: "approve" }), answerCtx(token));
    expect(approved.status).toBe(200);
    expect((await approved.json()).data.status).toBe("approved");
    expect((await answer.POST(json("/x", "POST", { answer: "decline" }), answerCtx(token))).status).toBe(409);

    const detail = await (await one.GET(json(`/api/admin/quotes/${id}`, "GET"), ctx(id))).json();
    expect(detail.data.quote.status).toBe("approved");
    expect(detail.data.events.map((event: { kind: string }) => event.kind)).toEqual(expect.arrayContaining(["created", "edited", "sent", "approved"]));
  });

  it("sends a quote back to the admin when the client asks for changes, and lets it be edited and sent again", async () => {
    const list = await import("../app/api/admin/quotes/route");
    const one = await import("../app/api/admin/quotes/[id]/route");
    const send = await import("../app/api/admin/quotes/[id]/send/route");
    const answer = await import("../app/api/quotes/answer/[token]/route");
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const id = (await (await list.POST(json("/api/admin/quotes", "POST", body({ customerName: "مؤسسة النخبة" })))).json()).data.id as string;
    const token = (await (await send.POST(json("/s", "POST"), ctx(id))).json()).data.url.split("/q/")[1] as string;
    const changes = await answer.POST(json("/x", "POST", { answer: "request_changes", note: "نبي رسائل أكثر" }), { params: Promise.resolve({ token }) });
    expect((await changes.json()).data.status).toBe("needs_changes");
    expect((await (await one.GET(json("/g", "GET"), ctx(id))).json()).data.quote.changeNote).toBe("نبي رسائل أكثر");
    // Editing brings it back to a draft, and sending again gives a new link; the old one stops working.
    expect((await (await one.PUT(json("/p", "PUT", body({ customerName: "مؤسسة النخبة" })), ctx(id))).json()).data.status).toBe("draft");
    const again = await (await send.POST(json("/s", "POST"), ctx(id))).json();
    const newToken = again.data.url.split("/q/")[1] as string;
    expect(newToken).not.toBe(token);
    expect((await answer.POST(json("/x", "POST", { answer: "approve" }), { params: Promise.resolve({ token }) })).status).toBe(404);
    expect((await answer.POST(json("/x", "POST", { answer: "decline" }), { params: Promise.resolve({ token: newToken }) })).status).toBe(200);
  });

  it("refuses an answer to an expired quote and a quote that was cancelled", async () => {
    const list = await import("../app/api/admin/quotes/route");
    const send = await import("../app/api/admin/quotes/[id]/send/route");
    const cancel = await import("../app/api/admin/quotes/[id]/cancel/route");
    const answer = await import("../app/api/quotes/answer/[token]/route");
    const { prisma } = await import("../lib/prisma");
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const make = async (name: string) => (await (await list.POST(json("/api/admin/quotes", "POST", body({ customerName: name })))).json()).data.id as string;

    const expired = await make("منتهي");
    const expiredToken = (await (await send.POST(json("/s", "POST"), ctx(expired))).json()).data.url.split("/q/")[1] as string;
    await prisma.$executeRaw`UPDATE quotes SET valid_until = '2020-01-01' WHERE id = ${expired}`;
    const late = await answer.POST(json("/x", "POST", { answer: "approve" }), { params: Promise.resolve({ token: expiredToken }) });
    expect(late.status).toBe(409);
    expect((await late.json()).error).toContain("انتهت");

    const cancelled = await make("ملغي");
    const cancelledToken = (await (await send.POST(json("/s", "POST"), ctx(cancelled))).json()).data.url.split("/q/")[1] as string;
    expect((await cancel.POST(json("/c", "POST"), ctx(cancelled))).status).toBe(200);
    expect((await answer.POST(json("/x", "POST", { answer: "approve" }), { params: Promise.resolve({ token: cancelledToken }) })).status).toBe(409);
    expect((await cancel.POST(json("/c", "POST"), ctx(cancelled))).status).toBe(409);
  });

  it("checks what is sent, and keeps the panel's routes for admins only", async () => {
    const list = await import("../app/api/admin/quotes/route");
    expect((await list.POST(json("/a", "POST", body({ customerName: "" })))).status).toBe(400);
    expect((await list.POST(json("/a", "POST", body({ lines: [] })))).status).toBe(400);
    expect((await list.POST(json("/a", "POST", body({ email: "not-an-email" })))).status).toBe(400);
    expect((await list.POST(json("/a", "POST", body({ logoDataUrl: "https://evil.example/logo.png" })))).status).toBe(400);
    expect((await list.POST(json("/a", "POST", body({ lines: [{ ...body().lines[0], vatRate: 7 }] })))).status).toBe(400);
    expect((await list.POST(json("/a", "POST", body({ lines: [{ ...body().lines[0], unitPriceHalalas: -5 }] })))).status).toBe(400);
    admin = null;
    expect((await list.GET()).status).toBe(403);
    expect((await list.POST(json("/a", "POST", body()))).status).toBe(403);
    const answer = await import("../app/api/quotes/answer/[token]/route");
    // The client's route needs no admin, only the link.
    expect((await answer.POST(json("/x", "POST", { answer: "approve" }), { params: Promise.resolve({ token: "short" }) })).status).toBe(404);
    admin = { id: "adm-1", email: "admin@example.com", name: "مدير المنصة" };
  });

  it("writes the cover and terms from the services when no model is configured", async () => {
    const draft = await import("../app/api/admin/quotes/draft-content/route");
    const { listQuoteServices } = await import("../lib/quotes/store");
    const { lineFromService, defaultFieldValues } = await import("../lib/quotes/model");
    const services = await listQuoteServices();
    expect(services.map((service) => service.name)).toEqual(["رسائل واتساب ترويجية", "إعداد وتجهيز الرقم", "التوثيق التجاري ورفع حد الإرسال"]);
    const lines = services.map((service) => lineFromService(service, defaultFieldValues(service)));
    const result = await (await draft.POST(json("/d", "POST", { lines }))).json();
    expect(result.data).toMatchObject({ source: "template", headline: "نصل برسالتك إلى عملائك", eyebrow: "حملة ترويجية عبر واتساب" });
    expect(result.data.subtitle).toContain("75,000");
    expect(result.data.terms.length).toBeGreaterThanOrEqual(3);
    // Without a model every line keeps the text its service wrote for it.
    expect(result.data.lineDescriptions).toEqual(lines.map((line) => line.description));
  });

  it("uses what the model writes when it is well formed, and never sends it a price", async () => {
    const { draftQuoteContent } = await import("../lib/quotes/ai");
    const { listQuoteServices } = await import("../lib/quotes/store");
    const { lineFromService, defaultFieldValues } = await import("../lib/quotes/model");
    const services = await listQuoteServices();
    const lines = services.map((service) => lineFromService(service, defaultFieldValues(service)));
    const brief = { customerName: "ELECT", billingCycle: "سنوي", lines, services };
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const answer = (payload: unknown) => vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] } }] }), { status: 200 }));

    const good = answer({ eyebrow: "حملة", headline: "عنوان من النموذج", subtitle: "وصف", terms: ["شرط أول", "شرط ثان"], lineDescriptions: ["وصف أول", "وصف ثان", "وصف ثالث"] });
    vi.stubGlobal("fetch", good);
    const written = await draftQuoteContent(brief);
    expect(written).toMatchObject({ source: "ai", headline: "عنوان من النموذج", lineDescriptions: ["وصف أول", "وصف ثان", "وصف ثالث"] });
    const sent = String((good.mock.calls[0] as unknown[])[1] ? ((good.mock.calls[0] as unknown[])[1] as { body: string }).body : "");
    expect(sent).not.toMatch(/unitPrice|priceSar|2250000|240000/);

    // The wrong number of descriptions is not trusted: the cover is kept, the lines keep their own texts.
    vi.stubGlobal("fetch", answer({ eyebrow: "حملة", headline: "عنوان", subtitle: "وصف", terms: ["أ", "ب"], lineDescriptions: ["وصف واحد فقط"] }));
    const short = await draftQuoteContent(brief);
    expect(short.source).toBe("ai");
    expect(short.lineDescriptions).toEqual(lines.map((line) => line.description));

    // An answer that is not what was asked for falls back to the services' own words.
    vi.stubGlobal("fetch", answer("ليس JSON"));
    expect((await draftQuoteContent(brief)).source).toBe("template");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect((await draftQuoteContent(brief)).source).toBe("template");
    vi.unstubAllGlobals();
    vi.stubEnv("GEMINI_API_KEY", "");
  });
});

describe("after the client approves", () => {
  async function approvedQuote(overrides: Record<string, unknown> = {}) {
    const list = await import("../app/api/admin/quotes/route");
    const send = await import("../app/api/admin/quotes/[id]/send/route");
    const answer = await import("../app/api/quotes/answer/[token]/route");
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const id = (await (await list.POST(json("/api/admin/quotes", "POST", body(overrides)))).json()).data.id as string;
    const token = (await (await send.POST(json("/s", "POST"), ctx(id))).json()).data.url.split("/q/")[1] as string;
    const approved = await answer.POST(json("/x", "POST", { answer: "approve" }), { params: Promise.resolve({ token }) });
    return { id, approved, ctx };
  }

  async function seedPlan() {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    await prisma.plan.upsert({
      where: { name: "باقة اختبار العروض" }, update: {},
      create: { id: "plan-quotes-test", name: "باقة اختبار العروض", monthlyPrice: 899, employeeLimit: 5, sortOrder: 1, active: 1, allowedChannels: "*", messageQuota: 1000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    });
  }

  it("makes a stopped workspace on the Individuals plan with the amount waiting, and only the platform team's confirmation pays it", async () => {
    await seedPlan();
    const { prisma } = await import("../lib/prisma");
    const payment = await import("../app/api/admin/quotes/[id]/payment/route");
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const individuals = (await prisma.plan.findUnique({ where: { name: "باقة الأفراد" } }))!;

    const { id, approved } = await approvedQuote({ customerName: "شركة النور", email: "owner@noor.example" });
    expect(approved.status).toBe(200);
    const { getQuote } = await import("../lib/quotes/store");
    const quote = (await getQuote(id))!;
    expect(quote.tenantId).toMatch(/^tenant-/);
    expect(quote.paymentId).toMatch(/^sub-pay-quote-/);

    // The workspace exists, its owner has an activation link, and it is stopped until the money is confirmed.
    const subscription = (await prisma.subscription.findUnique({ where: { tenantId: quote.tenantId } }))!;
    expect(subscription).toMatchObject({ companyName: "شركة النور", ownerEmail: "owner@noor.example", plan: "باقة الأفراد", status: "متوقف", billingCycle: "سنوي" });
    expect(await prisma.userAccount.findUnique({ where: { email: "owner@noor.example" } })).toMatchObject({ tenantId: quote.tenantId, passwordHash: "", role: "مالك الحساب" });
    expect(await prisma.employeeInvite.count({ where: { email: "owner@noor.example" } })).toBe(1);

    // The amount is waiting: the price without tax, and what is to be paid with tax.
    const waiting = (await prisma.subscriptionPayment.findUnique({ where: { id: quote.paymentId } }))!;
    expect(waiting).toMatchObject({ status: "قيد الانتظار", amount: 22500, amountHalalas: 2_587_500, planName: "باقة الأفراد", planEmployeeLimit: individuals.employeeLimit, planMessageQuota: 0, billingCycle: "سنوي", gateway: "manual" });
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId: quote.tenantId } }))).toBeNull();

    // Confirming pays it: completed payment, active subscription for a year.
    const before = Date.now();
    const confirmed = await payment.POST(json("/p", "POST"), ctx(id));
    expect(confirmed.status).toBe(200);
    const paid = (await prisma.subscriptionPayment.findUnique({ where: { id: quote.paymentId } }))!;
    expect(paid.status).toBe("مكتمل");
    const active = (await prisma.subscription.findUnique({ where: { tenantId: quote.tenantId } }))!;
    expect(active).toMatchObject({ status: "نشط", amount: 22500, billingCycle: "سنوي" });
    expect(new Date(active.renewalAt).getTime()).toBeGreaterThan(before + 360 * 86_400_000);
    // The balance is exactly what the quote sold (75,000), as bought credit that renewals keep: no plan allowance on top.
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId: quote.tenantId } }))).toMatchObject({ balance: 75000, purchasedBalance: 75000 });
    const { listQuoteEvents } = await import("../lib/quotes/store");
    expect((await listQuoteEvents(id)).map((event) => event.kind)).toContain("messages_credited");
    expect((await getQuote(id))!.paidAt).not.toBe("");

    // A second confirmation changes nothing.
    expect((await payment.POST(json("/p", "POST"), ctx(id))).status).toBe(409);
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId: quote.tenantId } }))?.balance).toBe(75000);

    // A year later the plan's allowance is renewed as for any customer, and what is left of the bought messages is still there.
    await prisma.campaignBalance.update({ where: { tenantId: quote.tenantId }, data: { balance: 68000 } }); // 7,000 sent
    const { applyConfirmedSubscriptionPayment } = await import("../lib/subscriptions");
    await prisma.subscriptionPayment.create({ data: { id: "renewal-after-quote", tenantId: quote.tenantId, amount: 22500, amountHalalas: 2_587_500, status: "قيد الانتظار", createdAt: new Date().toISOString(), planName: "باقة اختبار العروض", planEmployeeLimit: 5, planMessageQuota: 1000, billingCycle: "سنوي" } });
    await applyConfirmedSubscriptionPayment("renewal-after-quote", { gateway: "test", gatewayStatus: "paid" });
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId: quote.tenantId } }))).toMatchObject({ balance: 80000, purchasedBalance: 68000 });
  });

  it("counts the messages a quote sells from its lines", async () => {
    const { messagesSold } = await import("../lib/quotes/model");
    expect(messagesSold([{ quantity: 1, fields: { messages: "75000" } }, { quantity: 1, fields: {} }])).toBe(75000);
    expect(messagesSold([{ quantity: 2, fields: { messages: "75,000" } }])).toBe(150000);
    expect(messagesSold([{ quantity: 1, fields: { messages: "abc" } }, { quantity: 1, fields: { notes: "x" } }])).toBe(0);
  });

  it("makes the workspace on another plan only when the quote has a line for it, and allows one plan line at most", async () => {
    await seedPlan();
    const { prisma } = await import("../lib/prisma");
    const list = await import("../app/api/admin/quotes/route");
    const planLine = (name: string) => ({ serviceId: `plan:${name}`, name: `اشتراك ${name}`, description: "", quantity: 1, unitPriceHalalas: 89_900, vatRate: 15, fields: {} });
    const { id, approved } = await approvedQuote({ customerName: "شركة بباقة", email: "plan@example.com", lines: [...body().lines, planLine("باقة اختبار العروض")] });
    expect(approved.status).toBe(200);
    const { getQuote } = await import("../lib/quotes/store");
    const quote = (await getQuote(id))!;
    expect(quote.planName).toBe("باقة اختبار العروض");
    expect((await prisma.subscription.findUnique({ where: { tenantId: quote.tenantId } }))?.plan).toBe("باقة اختبار العروض");
    expect((await prisma.subscriptionPayment.findUnique({ where: { id: quote.paymentId } }))).toMatchObject({ planName: "باقة اختبار العروض", planEmployeeLimit: 5 });
    expect((await list.POST(json("/a", "POST", body({ lines: [...body().lines, planLine("باقة اختبار العروض"), planLine("باقة ثانية")] })))).status).toBe(400);
  });

  it("keeps the client's approval when the workspace cannot be made, and makes it when the platform team runs it again", async () => {
    await seedPlan();
    const { prisma } = await import("../lib/prisma");
    const provision = await import("../app/api/admin/quotes/[id]/provision/route");
    const payment = await import("../app/api/admin/quotes/[id]/payment/route");
    const { getQuote, listQuoteEvents } = await import("../lib/quotes/store");
    // The client's email already belongs to an account that was activated: no second workspace is made behind it.
    await prisma.userAccount.create({ data: { id: "user-taken", name: "موجود", email: "taken@example.com", passwordHash: "x", role: "مالك الحساب", tenantId: "tenant-taken", createdAt: new Date().toISOString() } });
    const { id, approved, ctx } = await approvedQuote({ customerName: "بريد مستخدم", email: "taken@example.com" });
    expect(approved.status).toBe(200);
    expect((await approved.json()).data.status).toBe("approved");
    let quote = (await getQuote(id))!;
    expect(quote).toMatchObject({ status: "approved", tenantId: "", paymentId: "" });
    expect((await listQuoteEvents(id)).map((event) => event.kind)).toContain("provision_failed");
    expect((await payment.POST(json("/p", "POST"), ctx(id))).status).toBe(409); // nothing to confirm yet

    // The platform team corrects the owner's email and runs it again.
    expect((await provision.POST(json("/p", "POST", { email: "not-an-email" }), ctx(id))).status).toBe(400);
    const again = await provision.POST(json("/p", "POST", { email: "fresh@example.com" }), ctx(id));
    expect(again.status).toBe(200);
    quote = (await getQuote(id))!;
    expect(quote.tenantId).toMatch(/^tenant-/);
    expect(quote.paymentId).toMatch(/^sub-pay-quote-/);
    expect(quote.email).toBe("fresh@example.com");
    // Running it a third time does not make a second workspace or a second payment.
    expect((await provision.POST(json("/p", "POST"), ctx(id))).status).toBe(200);
    expect(await prisma.subscriptionPayment.count({ where: { tenantId: quote.tenantId } })).toBe(1);
  });

  it("does nothing for a quote that was not approved, and keeps these routes for admins only", async () => {
    await seedPlan();
    const list = await import("../app/api/admin/quotes/route");
    const provision = await import("../app/api/admin/quotes/[id]/provision/route");
    const payment = await import("../app/api/admin/quotes/[id]/payment/route");
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const draftId = (await (await list.POST(json("/a", "POST", body({ customerName: "مسودة فقط" })))).json()).data.id as string;
    expect((await provision.POST(json("/p", "POST"), ctx(draftId))).status).toBe(409);
    expect((await payment.POST(json("/p", "POST"), ctx(draftId))).status).toBe(409);
    admin = null;
    expect((await provision.POST(json("/p", "POST"), ctx(draftId))).status).toBe(403);
    expect((await payment.POST(json("/p", "POST"), ctx(draftId))).status).toBe(403);
    admin = { id: "adm-1", email: "admin@example.com", name: "مدير المنصة" };
  });
});

describe("a quote for a client who already has a workspace", () => {
  async function existingClient() {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const tenantId = "tenant-existing-iceco";
    const renewalAt = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
    await prisma.subscription.upsert({
      where: { tenantId }, update: {},
      create: { id: `sub-${tenantId}`, tenantId, companyName: "شركة المثلجات", ownerName: "مالك", ownerEmail: "owner@iceco.example", plan: "باقة الأفراد", status: "نشط", employeeLimit: 1, amount: 199, billingCycle: "شهري", renewalAt, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    });
    return { tenantId, renewalAt, prisma };
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("records the approval, puts the amount waiting on their workspace, and confirming it counts the payment and credits the messages without touching their subscription", async () => {
    const { tenantId, renewalAt, prisma } = await existingClient();
    const list = await import("../app/api/admin/quotes/route");
    const approve = await import("../app/api/admin/quotes/[id]/approve/route");
    const payment = await import("../app/api/admin/quotes/[id]/payment/route");
    const { getQuote } = await import("../lib/quotes/store");
    const subscriptions = await prisma.subscription.count();
    const accounts = await prisma.userAccount.count();

    // Written with the date it was sent on, and no payment-terms line.
    const created = await (await list.POST(json("/a", "POST", body({ customerName: "شركة المثلجات", email: "owner@iceco.example", existingTenantId: tenantId, issuedOn: "2026-10-29", validityDays: 7, paymentTerms: "" })))).json();
    expect(created.data).toMatchObject({ issuedOn: "2026-10-29", validUntil: "2026-11-05", paymentTerms: "", linkedExisting: true, tenantId });
    const id = created.data.id as string;

    expect((await approve.POST(json("/p", "POST"), ctx(id))).status).toBe(200);
    const quote = (await getQuote(id))!;
    expect(quote).toMatchObject({ status: "approved", tenantId, linkedExisting: true });
    expect(quote.paymentId).toMatch(/^cpay-quote-/);
    // Nothing new was made: no workspace, no account, no subscription payment, no email.
    expect(await prisma.subscription.count()).toBe(subscriptions);
    expect(await prisma.userAccount.count()).toBe(accounts);
    expect(await prisma.subscriptionPayment.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.campaignPayment.findUnique({ where: { id: quote.paymentId } })).toMatchObject({ status: "قيد الانتظار", amount: 22500, amountHalalas: 2_587_500, messages: 75000, gateway: "manual" });
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance ?? 0).toBe(0);

    // The transfer is confirmed: the payment is completed (and so counted), the messages are credited as bought credit.
    expect((await payment.POST(json("/p", "POST"), ctx(id))).status).toBe(200);
    expect(await prisma.campaignPayment.findUnique({ where: { id: quote.paymentId } })).toMatchObject({ status: "مكتمل" });
    expect(await prisma.campaignBalance.findUnique({ where: { tenantId } })).toMatchObject({ balance: 75000, purchasedBalance: 75000 });
    expect((await getQuote(id))!.paidAt).not.toBe("");
    // Their subscription is exactly what it was.
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({ plan: "باقة الأفراد", status: "نشط", amount: 199, billingCycle: "شهري", renewalAt });

    // Once only.
    expect((await payment.POST(json("/p", "POST"), ctx(id))).status).toBe(409);
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId } }))?.balance).toBe(75000);
    expect((await approve.POST(json("/p", "POST"), ctx(id))).status).toBe(409);
  });

  it("refuses a client that does not exist, a plan line for an existing client, and an approval for a quote that is not a draft", async () => {
    const { tenantId } = await existingClient();
    const list = await import("../app/api/admin/quotes/route");
    const send = await import("../app/api/admin/quotes/[id]/send/route");
    const approve = await import("../app/api/admin/quotes/[id]/approve/route");
    expect((await list.POST(json("/a", "POST", body({ existingTenantId: "tenant-nobody" })))).status).toBe(400);
    const planLine = { serviceId: "plan:باقة اختبار العروض", name: "اشتراك", description: "", quantity: 1, unitPriceHalalas: 100, vatRate: 15, fields: {} };
    expect((await list.POST(json("/a", "POST", body({ existingTenantId: tenantId, lines: [...body().lines, planLine] })))).status).toBe(400);
    const id = (await (await list.POST(json("/a", "POST", body({ existingTenantId: tenantId, customerName: "أرسلناه" })))).json()).data.id as string;
    expect((await send.POST(json("/s", "POST"), ctx(id))).status).toBe(200);
    expect((await approve.POST(json("/p", "POST"), ctx(id))).status).toBe(409); // sent: only the client answers
    admin = null;
    expect((await approve.POST(json("/p", "POST"), ctx(id))).status).toBe(403);
    admin = { id: "adm-1", email: "admin@example.com", name: "مدير المنصة" };
  });
});

describe("a ready quotation uploaded as a PDF", () => {
  const pdf = () => new File([new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")], "S00121.pdf", { type: "application/pdf" });
  const upload = async (fields: Record<string, string>, file: File | null = pdf()) => {
    const route = await import("../app/api/admin/quotes/upload/route");
    const form = new FormData();
    if (file) form.set("file", file);
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return route.POST(new NextRequest("http://localhost/api/admin/quotes/upload", { method: "POST", body: form }));
  };
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const base = { customerName: "شركة المثلجات", email: "ice@example.com", reference: "S00121", issuedOn: "2026-10-29", subtotalSar: "25,500", vatRate: "15", messages: "75,000", billingCycle: "سنوي" };

  it("keeps the file and the amounts, serves the file to admins only, and never sends or edits it", async () => {
    const { getQuote, getQuoteFile } = await import("../lib/quotes/store");
    const file = await import("../app/api/admin/quotes/[id]/file/route");
    const send = await import("../app/api/admin/quotes/[id]/send/route");
    const one = await import("../app/api/admin/quotes/[id]/route");
    const made = await upload(base);
    expect(made.status).toBe(200);
    const id = (await made.json()).data.id as string;
    const quote = (await getQuote(id))!;
    expect(quote).toMatchObject({ source: "uploaded", reference: "S00121", fileName: "S00121.pdf", status: "draft", issuedOn: "2026-10-29", subtotalHalalas: 2_550_000, vatHalalas: 382_500, totalHalalas: 2_932_500 });
    expect((await getQuoteFile(id))!.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const served = await file.GET(json("/f", "GET"), ctx(id));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("application/pdf");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await served.arrayBuffer()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    admin = null;
    expect((await file.GET(json("/f", "GET"), ctx(id))).status).toBe(403);
    admin = { id: "adm-1", email: "admin@example.com", name: "مدير المنصة" };

    expect((await send.POST(json("/s", "POST"), ctx(id))).status).toBe(400);
    expect((await one.PUT(json(`/p`, "PUT", body()), ctx(id))).status).toBe(409);
  });

  it("refuses what is not a PDF, a file that is too big, missing amounts and a missing client", async () => {
    const text = new File([new TextEncoder().encode("هذا ليس ملف PDF")], "fake.pdf", { type: "application/pdf" });
    expect((await upload(base, text)).status).toBe(400);
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 10).fill(0x25)], "big.pdf", { type: "application/pdf" });
    expect((await upload(base, big)).status).toBe(400);
    expect((await upload(base, null)).status).toBe(400);
    expect((await upload({ ...base, subtotalSar: "" })).status).toBe(400);
    expect((await upload({ ...base, subtotalSar: "-5" })).status).toBe(400);
    expect((await upload({ ...base, customerName: "" })).status).toBe(400);
    expect((await upload({ ...base, email: "" })).status).toBe(400); // a new client needs the email the activation link goes to
    expect((await upload({ ...base, existingTenantId: "tenant-nobody" })).status).toBe(400);
    admin = null;
    expect((await upload(base)).status).toBe(403);
    admin = { id: "adm-1", email: "admin@example.com", name: "مدير المنصة" };
  });

  it("for a client who already has a workspace: approval puts the amount waiting, and the confirmed transfer counts it and credits the messages", async () => {
    const { prisma } = await import("../lib/prisma");
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const tenantId = "tenant-uploaded-existing";
    await prisma.subscription.upsert({ where: { tenantId }, update: {}, create: { id: `sub-${tenantId}`, tenantId, companyName: "شركة المثلجات", ownerName: "مالك", ownerEmail: "owner@ice2.example", plan: "باقة الأفراد", status: "نشط", employeeLimit: 1, amount: 199, billingCycle: "شهري", renewalAt: "2027-06-01", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    const approve = await import("../app/api/admin/quotes/[id]/approve/route");
    const payment = await import("../app/api/admin/quotes/[id]/payment/route");
    const { getQuote } = await import("../lib/quotes/store");
    const id = (await (await upload({ ...base, existingTenantId: tenantId, email: "", customerName: "شركة المثلجات (مرفوع)" })).json()).data.id as string;
    expect((await approve.POST(json("/p", "POST"), ctx(id))).status).toBe(200);
    const quote = (await getQuote(id))!;
    expect(await prisma.campaignPayment.findUnique({ where: { id: quote.paymentId } })).toMatchObject({ status: "قيد الانتظار", amount: 25500, amountHalalas: 2_932_500, messages: 75000, tenantId });
    expect((await payment.POST(json("/p", "POST"), ctx(id))).status).toBe(200);
    expect(await prisma.campaignPayment.findUnique({ where: { id: quote.paymentId } })).toMatchObject({ status: "مكتمل" });
    expect(await prisma.campaignBalance.findUnique({ where: { tenantId } })).toMatchObject({ balance: 75000, purchasedBalance: 75000 });
    expect(await prisma.subscription.findUnique({ where: { tenantId } })).toMatchObject({ plan: "باقة الأفراد", status: "نشط", renewalAt: "2027-06-01", amount: 199 });
  });
});
