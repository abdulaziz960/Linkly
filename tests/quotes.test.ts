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

  it("needs a plan to send, then makes a stopped workspace with the amount waiting, and only the platform team's confirmation pays it", async () => {
    await seedPlan();
    const { prisma } = await import("../lib/prisma");
    const send = await import("../app/api/admin/quotes/[id]/send/route");
    const list = await import("../app/api/admin/quotes/route");
    const payment = await import("../app/api/admin/quotes/[id]/payment/route");
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

    // No plan, no sending: the workspace could not be made on approval.
    const noPlan = (await (await list.POST(json("/a", "POST", body({ planName: "", customerName: "بلا باقة" })))).json()).data.id as string;
    expect((await send.POST(json("/s", "POST"), ctx(noPlan))).status).toBe(400);

    const { id, approved } = await approvedQuote({ customerName: "شركة النور", email: "owner@noor.example" });
    expect(approved.status).toBe(200);
    const { getQuote } = await import("../lib/quotes/store");
    const quote = (await getQuote(id))!;
    expect(quote.tenantId).toMatch(/^tenant-/);
    expect(quote.paymentId).toMatch(/^sub-pay-quote-/);

    // The workspace exists, its owner has an activation link, and it is stopped until the money is confirmed.
    const subscription = (await prisma.subscription.findUnique({ where: { tenantId: quote.tenantId } }))!;
    expect(subscription).toMatchObject({ companyName: "شركة النور", ownerEmail: "owner@noor.example", plan: "باقة اختبار العروض", status: "متوقف", billingCycle: "سنوي" });
    expect(await prisma.userAccount.findUnique({ where: { email: "owner@noor.example" } })).toMatchObject({ tenantId: quote.tenantId, passwordHash: "", role: "مالك الحساب" });
    expect(await prisma.employeeInvite.count({ where: { email: "owner@noor.example" } })).toBe(1);

    // The amount is waiting: the price without tax, and what is to be paid with tax.
    const waiting = (await prisma.subscriptionPayment.findUnique({ where: { id: quote.paymentId } }))!;
    expect(waiting).toMatchObject({ status: "قيد الانتظار", amount: 22500, amountHalalas: 2_587_500, planName: "باقة اختبار العروض", planEmployeeLimit: 5, planMessageQuota: 1000, billingCycle: "سنوي", gateway: "manual" });
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId: quote.tenantId } }))).toBeNull();

    // Confirming pays it: completed payment, active subscription for a year, the plan's allowance credited.
    const before = Date.now();
    const confirmed = await payment.POST(json("/p", "POST"), ctx(id));
    expect(confirmed.status).toBe(200);
    const paid = (await prisma.subscriptionPayment.findUnique({ where: { id: quote.paymentId } }))!;
    expect(paid.status).toBe("مكتمل");
    const active = (await prisma.subscription.findUnique({ where: { tenantId: quote.tenantId } }))!;
    expect(active).toMatchObject({ status: "نشط", amount: 22500, billingCycle: "سنوي" });
    expect(new Date(active.renewalAt).getTime()).toBeGreaterThan(before + 360 * 86_400_000);
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId: quote.tenantId } }))?.balance).toBe(12000);
    expect((await getQuote(id))!.paidAt).not.toBe("");

    // A second confirmation changes nothing.
    expect((await payment.POST(json("/p", "POST"), ctx(id))).status).toBe(409);
    expect((await prisma.campaignBalance.findUnique({ where: { tenantId: quote.tenantId } }))?.balance).toBe(12000);
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
