import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-leads-api.db");
const tenantId = "tenant-leads-api-test";
const otherTenantId = "tenant-leads-api-other";

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

async function seedLead(forTenantId: string, id: string) {
  const { prisma } = await import("../lib/prisma");
  await prisma.customer.create({ data: { id: `${id}-customer`, tenantId: forTenantId, name: "عميل محتمل", phone: "+966500000000", initial: "ع" } });
  await prisma.lead.create({
    data: {
      id,
      tenantId: forTenantId,
      customerId: `${id}-customer`,
      conversationId: "",
      source: "snapchat",
      formId: "form-1",
      formName: "عرض سبتمبر",
      name: "عميل محتمل",
      phone: "+966500000000",
      email: "",
      answersJson: JSON.stringify([{ question: "PHONE_NUMBER", answer: "+966500000000" }]),
      createdAt: new Date().toISOString()
    }
  });
}

describe("Leads API", () => {
  it("lists only the authenticated tenant's leads", async () => {
    const { ensureSchema } = await import("../lib/database");
    await ensureSchema();
    const { generateApiKey } = await import("../lib/developer-api");

    await seedLead(tenantId, "lead-mine");
    await seedLead(otherTenantId, "lead-not-mine");

    const { rawKey } = await generateApiKey(tenantId, "leads test key");
    const { GET } = await import("../app/api/v1/leads/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/leads", {
      headers: { Authorization: `Bearer ${rawKey}` }
    }));
    const payload = await response.json();

    expect(payload.ok).toBe(true);
    expect(payload.data.items.map((item: { id: string }) => item.id)).toEqual(["lead-mine"]);
  });

  it("rejects a request with no or an invalid API key", async () => {
    const { GET } = await import("../app/api/v1/leads/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/leads"));
    expect(response.status).toBe(401);
  });

  it("returns full answers on the single-lead detail route, 404s for another tenant's lead", async () => {
    const { generateApiKey } = await import("../lib/developer-api");
    const { rawKey } = await generateApiKey(tenantId, "leads detail key");
    const { GET } = await import("../app/api/v1/leads/[id]/route");

    const ok = await GET(
      new NextRequest("http://localhost/api/v1/leads/lead-mine", { headers: { Authorization: `Bearer ${rawKey}` } }),
      { params: Promise.resolve({ id: "lead-mine" }) }
    );
    const okPayload = await ok.json();
    expect(okPayload.ok).toBe(true);
    expect(okPayload.data.answers).toEqual([{ question: "PHONE_NUMBER", answer: "+966500000000" }]);

    const notFound = await GET(
      new NextRequest("http://localhost/api/v1/leads/lead-not-mine", { headers: { Authorization: `Bearer ${rawKey}` } }),
      { params: Promise.resolve({ id: "lead-not-mine" }) }
    );
    expect(notFound.status).toBe(404);
  });
});
