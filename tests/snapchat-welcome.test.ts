import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-snapchat-welcome.db");
const sendTemplate = vi.fn(async (..._args: unknown[]) => ({ ok: true as boolean, error: "" }));
let settings: { leadAdsEnabled: number; leadWelcomeTemplateName: string } = { leadAdsEnabled: 1, leadWelcomeTemplateName: "welcome_ar" };

vi.mock("../lib/campaign-engine", () => ({ sendWhatsAppTemplate: (...args: unknown[]) => sendTemplate(...args) }));
vi.mock("../lib/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/database")>()),
  getIntegrationSettings: vi.fn(async () => settings)
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "test-integration-key-with-at-least-32-characters");
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

beforeEach(() => {
  sendTemplate.mockClear();
  settings = { leadAdsEnabled: 1, leadWelcomeTemplateName: "welcome_ar" };
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

const answers = (phone: string) => [
  { question: "FULL_NAME", answer: "أحمد" },
  { question: "PHONE_NUMBER", answer: phone }
];

async function store(leadId: string, phone: string) {
  const { storeSnapchatLead } = await import("../lib/snapchat-inbox");
  return storeSnapchatLead({ tenantId: "ten-snap", adAccountId: "acc", formId: "f1", formName: "نموذج", leadId, answers: answers(phone) });
}

describe("Snapchat lead welcome on WhatsApp", () => {
  it("sends the welcome template once for a new lead and notes it in the conversation", async () => {
    const result = await store("L-NEW-0001", "0500000111");
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate.mock.calls[0].slice(0, 5)).toEqual(["ten-snap", "966500000111", "welcome_ar", "ar", "أحمد"]);

    const { prisma } = await import("../lib/prisma");
    const note = await prisma.message.findFirst({ where: { conversationId: result.conversationId, direction: "out" } });
    expect(note?.text).toContain("أُرسلت رسالة ترحيب");

    // The same lead arriving again (webhook + cron) must not welcome twice.
    await store("L-NEW-0001", "0500000111");
    expect(sendTemplate).toHaveBeenCalledTimes(1);
  });

  it("turns local and international formats into a WhatsApp number", async () => {
    const { whatsappNumberFromForm } = await import("../lib/snapchat-inbox");
    expect(whatsappNumberFromForm("0500000111")).toBe("966500000111");
    expect(whatsappNumberFromForm("500000111")).toBe("966500000111");
    expect(whatsappNumberFromForm("+966 50 000 0111")).toBe("966500000111");
    expect(whatsappNumberFromForm("00966500000111")).toBe("966500000111");
    expect(whatsappNumberFromForm("12345")).toBe("");
    expect(whatsappNumberFromForm("abc")).toBe("");
  });

  it("does nothing when the welcome is off or has no template", async () => {
    settings = { leadAdsEnabled: 0, leadWelcomeTemplateName: "welcome_ar" };
    await store("L-OFF-0002", "0500000222");
    settings = { leadAdsEnabled: 1, leadWelcomeTemplateName: "" };
    await store("L-OFF-0003", "0500000333");
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("records why it was not sent when the phone is unusable or WhatsApp rejects it", async () => {
    const { prisma } = await import("../lib/prisma");
    const bad = await store("L-BAD-0004", "abc");
    expect(sendTemplate).not.toHaveBeenCalled();
    expect((await prisma.message.findFirst({ where: { conversationId: bad.conversationId, direction: "out" } }))?.text).toContain("غير صالح");

    sendTemplate.mockResolvedValueOnce({ ok: false, error: "واتساب غير مربوط لهذا الحساب" });
    const rejected = await store("L-REJ-0005", "0500000555");
    expect((await prisma.message.findFirst({ where: { conversationId: rejected.conversationId, direction: "out" } }))?.text).toContain("تعذر إرسال");
  });
});
