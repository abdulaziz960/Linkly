import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-email-promotions.db");

beforeAll(async () => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
  const { ensureSchema } = await import("../lib/database");
  const { ensureEmailPromotionsSchema } = await import("../lib/email-promotions-schema");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  await ensureEmailPromotionsSchema();

  const tenantId = "tenant-email-promotions";
  await prisma.customer.createMany({
    data: [
      { id: "email-customer-1", tenantId, name: "Sara", phone: "sara@example.com", initial: "S" },
      { id: "email-customer-2", tenantId, name: "Nora", phone: "Nora <nora@example.com>", initial: "N" },
      { id: "email-customer-3", tenantId, name: "No Email", phone: "0500000000", initial: "N" },
      { id: "email-customer-4", tenantId, name: "Opt Out", phone: "optout@example.com", initial: "O" }
    ]
  });
  await prisma.conversation.createMany({
    data: [
      { id: "conv-email-1", tenantId, customerId: "email-customer-1", channel: "email", lastMessage: "hi", status: "assigned", assignee: "Agent" },
      { id: "conv-email-2", tenantId, customerId: "email-customer-2", channel: "whatsapp", lastMessage: "hi", status: "closed", assignee: "Agent" },
      { id: "conv-email-3", tenantId, customerId: "email-customer-3", channel: "email", lastMessage: "hi", status: "unassigned", assignee: "" },
      { id: "conv-email-4", tenantId, customerId: "email-customer-4", channel: "email", lastMessage: "hi", status: "assigned", assignee: "Agent" }
    ]
  });
  await prisma.conversationTag.create({ data: { conversationId: "conv-email-2", tagName: "vip" } });
  await prisma.emailMarketingOptOut.create({ data: { id: "optout-1", tenantId, email: "optout@example.com", createdAt: new Date().toISOString() } });
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("email promotion campaign validation", () => {
  it("requires unsubscribe-safe, valid campaign inputs", async () => {
    const { validateEmailCampaignInput } = await import("../lib/email-promotions");
    expect(validateEmailCampaignInput({
      name: "October offer",
      subject: "Big offer",
      senderName: "Linkly",
      senderEmail: "marketing@example.com",
      bodyHtml: "<p>Hello</p>",
      ctaText: "Open",
      ctaUrl: "https://example.com",
      audience: { mode: "all" }
    })).toBeNull();

    expect(validateEmailCampaignInput({
      name: "",
      subject: "Big offer",
      senderName: "Linkly",
      senderEmail: "not-email",
      bodyHtml: "<p>Hello</p>",
      audience: { mode: "all" }
    })).toBe("اسم الحملة مطلوب");
  });

  it("renders a polished Arabic email footer with unsubscribe link", async () => {
    const { decorateEmailHtml } = await import("../lib/email-promotions");
    const html = decorateEmailHtml({
      id: "email-campaign-test",
      name: "عرض تجريبي",
      bodyHtml: "<p>أهلًا بك</p>",
      ctaText: "احجز الآن",
      ctaUrl: "https://example.com"
    }, "recipient-1");

    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain("قائمة التواصل التسويقي لدينا");
    expect(html).toContain("إلغاء الاشتراك");
    expect(html).not.toContain("ضمن عملاء");
  });

  it("uses fixed email credit packages for transparent pricing", async () => {
    const { calculateEmailPromotionChargeAmount, calculateEmailPromotionChargeAmountHalalas, findEmailPromotionPriceTier } = await import("../lib/email-promotions");

    expect(calculateEmailPromotionChargeAmount(1000)).toBe(25);
    expect(calculateEmailPromotionChargeAmount(50000)).toBe(699);
    expect(calculateEmailPromotionChargeAmountHalalas(5000)).toBe(9900);
    expect(findEmailPromotionPriceTier(25000)).toMatchObject({ credits: 25000, price: 399 });
    expect(calculateEmailPromotionChargeAmount(2000)).toBe(50);
    expect(calculateEmailPromotionChargeAmount(7000)).toBe(138.6);
    expect(calculateEmailPromotionChargeAmount(999)).toBe(0);
  });
});

describe("email promotion recipient targeting", () => {
  it("targets only valid, non-opted-out email customers", async () => {
    const { resolveEmailRecipients } = await import("../lib/email-promotions");
    const recipients = await resolveEmailRecipients("tenant-email-promotions", { mode: "all" });
    expect(recipients.map((recipient) => recipient.email)).toEqual(["nora@example.com", "sara@example.com"]);
  });

  it("filters by tag, status, channel, and custom customer selection", async () => {
    const { resolveEmailRecipients } = await import("../lib/email-promotions");
    await expect(resolveEmailRecipients("tenant-email-promotions", { mode: "tag", tagNames: ["vip"] })).resolves.toMatchObject([{ email: "nora@example.com" }]);
    await expect(resolveEmailRecipients("tenant-email-promotions", { mode: "status", conversationStatus: "assigned" })).resolves.toMatchObject([{ email: "sara@example.com" }]);
    await expect(resolveEmailRecipients("tenant-email-promotions", { mode: "channel", channel: "email" })).resolves.toMatchObject([{ email: "sara@example.com" }]);
    await expect(resolveEmailRecipients("tenant-email-promotions", { mode: "custom", customerIds: ["email-customer-2", "email-customer-3"] })).resolves.toMatchObject([{ email: "nora@example.com" }]);
  });
});

describe("email promotion file uploads and balance", () => {
  it("parses email CSV files, dedupes, and ignores invalid rows", async () => {
    const { parseEmailRecipientFile } = await import("../lib/email-promotions");
    const rows = await parseEmailRecipientFile(Buffer.from("email,name\nsara@example.com,Sara\nbad,Nobody\nsara@example.com,Duplicate\nnora@example.com,Nora"), "emails.csv");
    expect(rows).toEqual([
      { customerId: "", email: "sara@example.com", name: "Sara" },
      { customerId: "", email: "nora@example.com", name: "Nora" }
    ]);
  });

  it("adds and reads email campaign balance", async () => {
    const { creditEmailCampaignBalance, getEmailCampaignBalance } = await import("../lib/email-promotions");
    await expect(creditEmailCampaignBalance("tenant-email-promotions", 250)).resolves.toBe(250);
    await expect(getEmailCampaignBalance("tenant-email-promotions")).resolves.toBe(250);
  });
});
