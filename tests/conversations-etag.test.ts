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
vi.mock("../lib/automation-engine", () => ({ processDueAutomations: vi.fn(async () => undefined) }));

import { GET } from "../app/api/conversations/route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/conversations", { headers });
}

describe("GET /api/conversations conditional responses", () => {
  beforeEach(() => {
    getConversations.mockReset().mockResolvedValue([{ id: "c1", messages: [{ id: "m1", text: "hello" }] }]);
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

  it("sends the full inbox again as soon as anything changes", async () => {
    const first = await GET(request());
    getConversations.mockResolvedValue([{ id: "c1", messages: [{ id: "m1", text: "hello" }, { id: "m2", text: "new message" }] }]);
    const second = await GET(request({ "If-None-Match": first.headers.get("etag") as string }));
    expect(second.status).toBe(200);
    expect((await second.json()).data[0].messages).toHaveLength(2);
  });
});
