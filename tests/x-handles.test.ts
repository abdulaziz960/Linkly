import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-x-handles.db");

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

describe("X customer label", () => {
  it("uses the profile name as the name and keeps the @handle separate", async () => {
    const { xCustomerLabel } = await import("../lib/x-handles");
    expect(xCustomerLabel({ name: "عبدالعزيز", username: "abdulazizksa85" })).toEqual({ name: "عبدالعزيز", handle: "@abdulazizksa85" });
    expect(xCustomerLabel({ username: "only_handle" })).toEqual({ name: "@only_handle", handle: "@only_handle" });
    expect(xCustomerLabel({ name: "  " , username: "u" }).name).toBe("@u");
    expect(xCustomerLabel(undefined)).toEqual({ name: undefined, handle: undefined });
  });

  it("stores a customer's handle per workspace and a conversation shows it, with the display name", async () => {
    const { storeXMessage } = await import("../lib/x-inbox");
    const { getXHandles } = await import("../lib/x-handles");
    const { getConversations } = await import("../lib/database");

    await storeXMessage({ tenantId: "t-handle", xUserId: "555", name: "عبدالعزيز", handle: "@abdulazizksa85", text: "هلا", direction: "in", messageId: "m-1" });
    await storeXMessage({ tenantId: "t-other", xUserId: "555", name: "Someone", handle: "@someone", text: "hi", direction: "in", messageId: "m-2" });

    expect((await getXHandles("t-handle")).get("555")).toBe("@abdulazizksa85");
    expect((await getXHandles("t-other")).get("555")).toBe("@someone");

    const conversation = (await getConversations("t-handle")).find((item) => item.channel === "x");
    expect(conversation).toMatchObject({ customer: "عبدالعزيز", handle: "@abdulazizksa85" });

    // a later message that carries no name (an encrypted event, say) must not replace the known one
    await storeXMessage({ tenantId: "t-handle", xUserId: "555", text: "مرحبا مرة ثانية", direction: "in", messageId: "m-3" });
    const again = (await getConversations("t-handle")).find((item) => item.channel === "x");
    expect(again).toMatchObject({ customer: "عبدالعزيز", handle: "@abdulazizksa85" });
  });
});
