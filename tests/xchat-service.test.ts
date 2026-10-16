import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-xchat-service.db");
const settings = { id: "s1", tenantId: "t-xchat-svc", status: "connected", wabaId: "111", accessToken: "tok", xAccessToken: "tok", xAccessTokenSecret: "r" };
let registerBehavior: "ok" | "fail" = "ok";

vi.mock("../lib/database", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/database")>()), getIntegrationSettings: vi.fn(async () => settings) }));
vi.mock("../lib/xchat/api", () => ({
  registerPublicKey: vi.fn(async () => {
    if (registerBehavior === "fail") throw new Error("X refused (403)");
    return "999";
  }),
  getUserPublicKeys: vi.fn(async () => []),
  toSigningKey: vi.fn(() => null),
  listConversations: vi.fn(async () => []),
  listConversationEvents: vi.fn(async () => ({ events: [], keyEvents: [] }))
}));

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});
beforeEach(() => {
  registerBehavior = "ok";
});
afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("encrypted X chat service", () => {
  it("does nothing, and never calls X, until the workspace enables it", async () => {
    const { syncXChatForTenant } = await import("../lib/xchat/service");
    const result = await syncXChatForTenant("t-xchat-svc");
    expect(result).toMatchObject({ ok: true, skipped: "not-enabled", stored: 0 });
    const api = await import("../lib/xchat/api");
    expect(api.listConversations).not.toHaveBeenCalled();
  });

  it("keeps the new keys even when X refuses the registration, and reports X's reason", async () => {
    registerBehavior = "fail";
    const { enableXChat } = await import("../lib/xchat/service");
    const { getXChatKeyStatus, deleteXChatKeys } = await import("../lib/xchat/keystore");
    const result = await enableXChat("t-xchat-svc");
    expect(result).toEqual({ ok: false, error: "X refused (403)" });
    expect(await getXChatKeyStatus("t-xchat-svc")).toMatchObject({ hasKeys: true, registered: false });
    await deleteXChatKeys("t-xchat-svc");
  });

  it("registers once, records the version X assigned, and a second call changes nothing", async () => {
    const { enableXChat, syncXChatForTenant } = await import("../lib/xchat/service");
    const { getXChatKeyStatus } = await import("../lib/xchat/keystore");
    const api = await import("../lib/xchat/api");

    const first = await enableXChat("t-xchat-svc");
    expect(first).toEqual({ ok: true, alreadyEnabled: false, keyVersion: "999" });
    expect(await getXChatKeyStatus("t-xchat-svc")).toEqual({ hasKeys: true, registered: true, keyVersion: "999" });

    const second = await enableXChat("t-xchat-svc");
    expect(second).toEqual({ ok: true, alreadyEnabled: true, keyVersion: "999" });
    expect(api.registerPublicKey).toHaveBeenCalledTimes(2); // one failed attempt above, one success

    const sync = await syncXChatForTenant("t-xchat-svc");
    expect(sync).toMatchObject({ ok: true, conversations: 0, stored: 0 });
    expect(api.listConversations).toHaveBeenCalled();
  });
});
