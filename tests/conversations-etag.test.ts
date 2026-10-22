import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getConversations = vi.fn();
vi.mock("../lib/database", () => ({ getConversations: (...args: unknown[]) => getConversations(...args) }));
vi.mock("../lib/auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1", role: "owner", email: "o@x.test", tenantId: "t1" })) }));
vi.mock("../lib/permissions-server", () => ({
  getEmployeeForUser: vi.fn(async () => null),
  getVisibleAssigneeNames: vi.fn(() => undefined)
}));
vi.mock("../lib/prisma", () => ({ prisma: {} }));
// The cheap inbox fingerprint (lib/conversations-version.ts) is driven by the test: it moves when the data changes.
const inboxFingerprint = vi.fn();
vi.mock("../lib/conversations-version", () => ({ inboxFingerprint: (...args: unknown[]) => inboxFingerprint(...args) }));
vi.mock("../lib/automation-engine", () => ({ processDueAutomations: vi.fn(async () => undefined) }));

import { GET } from "../app/api/conversations/route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/conversations", { headers });
}

describe("GET /api/conversations conditional responses", () => {
  let fingerprintCounter = 0;
  beforeEach(() => {
    getConversations.mockReset().mockResolvedValue([{ id: "c1", messages: [{ id: "m1", text: "hello" }] }]);
    // A different inbox per test (the built inbox is remembered while its fingerprint is unchanged).
    const version = `v${++fingerprintCounter}`;
    inboxFingerprint.mockReset().mockResolvedValue(version);
  });

  it("returns the inbox with an ETag and never lets the browser store it", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBeTruthy();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).data[0].id).toBe("c1");
  });

  it("answers 304 with no body when the client already has identical data", async () => {
    const first = await GET(request());
    const second = await GET(request({ "If-None-Match": first.headers.get("etag") as string }));
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("does not rebuild the inbox while its fingerprint is unchanged", async () => {
    await GET(request());
    await GET(request());
    await GET(request());
    expect(getConversations).toHaveBeenCalledTimes(1);
  });

  it("sends the full inbox again as soon as anything changes", async () => {
    const first = await GET(request());
    inboxFingerprint.mockResolvedValue("changed");
    getConversations.mockResolvedValue([{ id: "c1", messages: [{ id: "m1", text: "hello" }, { id: "m2", text: "new message" }] }]);
    const second = await GET(request({ "If-None-Match": first.headers.get("etag") as string }));
    expect(second.status).toBe(200);
    expect((await second.json()).data[0].messages).toHaveLength(2);
  });
});
