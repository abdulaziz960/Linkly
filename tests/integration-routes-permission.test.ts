import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const user = { id: "user-agent", name: "Support Employee", email: "agent@integrations.example", role: "موظف دعم", tenantId: "tenant-integrations-permission" };

vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));

const userHasViewPermission = vi.fn(async (_user: unknown, _view: string) => false);
const getVisibleAssigneeNames = vi.fn(async (): Promise<string[] | undefined> => ["Support Employee"]);
vi.mock("../lib/permissions-server", () => ({
  userHasViewPermission,
  getVisibleAssigneeNames,
  getEmployeeForUser: vi.fn(async () => ({ name: "Support Employee" }))
}));

const getIntegrationSettings = vi.fn(async () => ({ id: "settings-1", phoneNumberId: "", accessToken: "", wabaId: "", xAccessToken: "" }));
const getEmailIntegrationSettings = vi.fn(async () => ({ id: "email-1", provider: "gmail", status: "not_connected", senderName: "", emailAddress: "", webhookSecret: "", updatedAt: "" }));
vi.mock("../lib/database", () => ({
  getIntegrationSettings,
  getEmailIntegrationSettings,
  getTemplates: vi.fn(async () => [])
}));

const messageFindFirst = vi.fn(async (_args: unknown) => null);
vi.mock("../lib/prisma", () => ({
  prisma: { message: { findFirst: messageFindFirst }, emailIntegration: { update: vi.fn() }, integrationSetting: { update: vi.fn() } }
}));

vi.mock("../lib/rate-limit", () => ({
  consumeRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIdentifier: () => "test-identifier"
}));

afterEach(() => {
  userHasViewPermission.mockReset();
  userHasViewPermission.mockResolvedValue(false);
  getIntegrationSettings.mockClear();
  getEmailIntegrationSettings.mockClear();
  messageFindFirst.mockClear();
});

function json(url: string, method: string, body: unknown = {}) {
  return new NextRequest(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("integration routes need the settings permission", () => {
  it("email/integration GET and PATCH answer 403 and touch nothing", async () => {
    const { GET, PATCH } = await import("../app/api/email/integration/route");
    expect((await GET()).status).toBe(403);
    expect((await PATCH(json("/api/email/integration", "PATCH", { status: "not_connected" }))).status).toBe(403);
    expect(getEmailIntegrationSettings).not.toHaveBeenCalled();
    expect(userHasViewPermission).toHaveBeenCalledWith(user, "settings");
  });

  it("meta/business-profile GET and POST answer 403 before reading the WhatsApp credentials", async () => {
    const { GET, POST } = await import("../app/api/meta/business-profile/route");
    expect((await GET()).status).toBe(403);
    expect((await POST(json("/api/meta/business-profile", "POST", { about: "x" }))).status).toBe(403);
    expect(getIntegrationSettings).not.toHaveBeenCalled();
  });

  it("meta/test-message answers 403 before sending anything", async () => {
    const { POST } = await import("../app/api/meta/test-message/route");
    expect((await POST(json("/api/meta/test-message", "POST", { to: "966501234567", text: "hi" }))).status).toBe(403);
    expect(getIntegrationSettings).not.toHaveBeenCalled();
  });

  it("x/realtime/setup answers 403 before reading the X credentials", async () => {
    const { POST } = await import("../app/api/x/realtime/setup/route");
    expect((await POST(json("/api/x/realtime/setup", "POST"))).status).toBe(403);
    expect(getIntegrationSettings).not.toHaveBeenCalled();
  });

  it("the settings permission is what unlocks them", async () => {
    userHasViewPermission.mockResolvedValue(true);
    const { GET } = await import("../app/api/email/integration/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(getEmailIntegrationSettings).toHaveBeenCalledWith(user.tenantId);
  });
});

describe("x/post-reply", () => {
  it("needs the inbox permission", async () => {
    const { POST } = await import("../app/api/x/post-reply/route");
    const response = await POST(json("/api/x/post-reply", "POST", { messageId: "m1", text: "hello" }));
    expect(response.status).toBe(403);
    expect(userHasViewPermission).toHaveBeenCalledWith(user, "inbox");
    expect(messageFindFirst).not.toHaveBeenCalled();
  });

  it("only finds posts in conversations visible to this employee", async () => {
    userHasViewPermission.mockResolvedValue(true);
    const { POST } = await import("../app/api/x/post-reply/route");
    const response = await POST(json("/api/x/post-reply", "POST", { messageId: "m1", text: "hello" }));
    expect(response.status).toBe(400);
    const where = (messageFindFirst.mock.calls[0][0] as { where: { conversation: Record<string, unknown> } }).where;
    expect(where.conversation).toMatchObject({ tenantId: user.tenantId, channel: "x", assignee: { in: ["Support Employee"] } });
  });

  it("does not narrow the search for the account owner", async () => {
    userHasViewPermission.mockResolvedValue(true);
    getVisibleAssigneeNames.mockResolvedValueOnce(undefined);
    const { POST } = await import("../app/api/x/post-reply/route");
    await POST(json("/api/x/post-reply", "POST", { messageId: "m1", text: "hello" }));
    const where = (messageFindFirst.mock.calls[0][0] as { where: { conversation: Record<string, unknown> } }).where;
    expect(where.conversation).toEqual({ tenantId: user.tenantId, channel: "x" });
  });
});
