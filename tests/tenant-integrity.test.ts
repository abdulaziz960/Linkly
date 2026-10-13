import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-tenant-integrity.db");

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

async function setup() {
  const { ensureSchema } = await import("../lib/database");
  const { prisma } = await import("../lib/prisma");
  await ensureSchema();
  const make = (id: string, tenantId: string) =>
    prisma.customer.upsert({ where: { id }, update: {}, create: { id, name: id, phone: id, initial: "x", tenantId } });
  await make("cust-a", "tenant-a");
  await make("cust-b", "tenant-b");
  return { prisma };
}

const conversation = (id: string, tenantId: string, customerId: string) => ({
  id, tenantId, customerId, lastMessage: "", status: "unassigned", assignee: ""
});

describe("a conversation and its customer must belong to the same tenant", () => {
  it("allows a customer of the same tenant", async () => {
    const { prisma } = await setup();
    await expect(prisma.conversation.create({ data: conversation("conv-ok", "tenant-a", "cust-a") })).resolves.toMatchObject({ id: "conv-ok" });
  });

  it("rejects a customer of another tenant on insert", async () => {
    const { prisma } = await setup();
    await expect(prisma.conversation.create({ data: conversation("conv-cross", "tenant-a", "cust-b") })).rejects.toThrow();
    expect(await prisma.conversation.count({ where: { id: "conv-cross" } })).toBe(0);
  });

  it("rejects pointing an existing conversation at another tenant's customer, but allows its own", async () => {
    const { prisma } = await setup();
    await prisma.conversation.create({ data: conversation("conv-move", "tenant-a", "cust-a") });
    await expect(prisma.conversation.update({ where: { id: "conv-move" }, data: { customerId: "cust-b" } })).rejects.toThrow();
    await prisma.customer.upsert({ where: { id: "cust-a2" }, update: {}, create: { id: "cust-a2", name: "a2", phone: "a2", initial: "x", tenantId: "tenant-a" } });
    await expect(prisma.conversation.update({ where: { id: "conv-move" }, data: { customerId: "cust-a2" } })).resolves.toMatchObject({ customerId: "cust-a2" });
  });

  it("still accepts a customer that does not exist yet", async () => {
    const { prisma } = await setup();
    await expect(prisma.conversation.create({ data: conversation("conv-new", "tenant-a", "cust-not-created") })).resolves.toMatchObject({ id: "conv-new" });
  });

  it("leaves a legacy mismatched row alone: ordinary updates and idempotent upserts keep working", async () => {
    const { prisma } = await setup();
    // Simulate a row written before the triggers existed.
    await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS conversations_customer_same_tenant_insert");
    await prisma.conversation.create({ data: conversation("conv-legacy", "tenant-a", "cust-b") });
    const { ensureTenantIntegritySchema } = await import("../lib/tenant-integrity-schema");
    await ensureTenantIntegritySchema();

    await expect(prisma.conversation.update({ where: { id: "conv-legacy" }, data: { lastMessage: "hello", status: "open" } })).resolves.toMatchObject({ lastMessage: "hello" });
    // The message route upserts with the same customerId every time - unchanged values must not trip the trigger.
    await expect(prisma.conversation.update({ where: { id: "conv-legacy" }, data: { customerId: "cust-b", assignee: "someone" } })).resolves.toMatchObject({ assignee: "someone" });
  });

  it("is safe to install repeatedly", async () => {
    await setup();
    const { ensureTenantIntegritySchema } = await import("../lib/tenant-integrity-schema");
    await expect(ensureTenantIntegritySchema()).resolves.toBeUndefined();
    await expect(ensureTenantIntegritySchema()).resolves.toBeUndefined();
  });
});
