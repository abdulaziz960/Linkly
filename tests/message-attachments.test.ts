import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachmentResponseHeaders, isInlineDataUrl, messageAttachmentPath, parseDataUrl } from "../lib/message-attachments";

const findFirst = vi.fn();
const getCurrentUser = vi.fn();
const getVisibleAssigneeNames = vi.fn();
vi.mock("../lib/prisma", () => ({ prisma: { message: { findFirst: (...a: unknown[]) => findFirst(...a) } } }));
vi.mock("../lib/auth", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock("../lib/permissions-server", () => ({
  getEmployeeForUser: vi.fn(async () => null),
  getVisibleAssigneeNames: (...a: unknown[]) => getVisibleAssigneeNames(...a)
}));

import { GET } from "../app/api/conversations/[id]/messages/[messageId]/attachment/route";

const png = Buffer.from("fake-png-bytes").toString("base64");
const ctx = { params: Promise.resolve({ id: "c1", messageId: "m1" }) };
const req = () => new NextRequest("http://localhost/api/conversations/c1/messages/m1/attachment");

describe("attachment helpers", () => {
  it("recognises inline data URLs only", () => {
    expect(isInlineDataUrl(`data:image/png;base64,${png}`)).toBe(true);
    expect(isInlineDataUrl("https://cdn.example.test/a.png")).toBe(false);
    expect(isInlineDataUrl("")).toBe(false);
  });

  it("decodes a data URL back to its bytes and type", () => {
    const parsed = parseDataUrl(`data:image/png;base64,${png}`);
    expect(parsed?.mimeType).toBe("image/png");
    expect(parsed?.bytes.toString()).toBe("fake-png-bytes");
  });

  it("builds an escaped path", () => {
    expect(messageAttachmentPath("c 1", "m/1")).toBe("/api/conversations/c%201/messages/m%2F1/attachment");
  });

  it("serves allow-listed media inline and forces everything else to download as opaque bytes", () => {
    expect(attachmentResponseHeaders("image/png", "a.png", 5)["Content-Type"]).toBe("image/png");
    expect(attachmentResponseHeaders("image/png", "a.png", 5)["Content-Disposition"]).toMatch(/^inline/);
    for (const dangerous of ["text/html", "image/svg+xml", "application/javascript", "application/pdf"]) {
      const headers = attachmentResponseHeaders(dangerous, "x", 5);
      expect(headers["Content-Type"]).toBe("application/octet-stream");
      expect(headers["Content-Disposition"]).toMatch(/^attachment/);
    }
    expect(attachmentResponseHeaders("image/png", "a.png", 5)["X-Content-Type-Options"]).toBe("nosniff");
    expect(attachmentResponseHeaders("image/png", "a.png", 5)["Content-Security-Policy"]).toContain("sandbox");
  });
});

describe("GET attachment route", () => {
  beforeEach(() => {
    findFirst.mockReset();
    getCurrentUser.mockReset().mockResolvedValue({ id: "u1", role: "مالك الحساب", tenantId: "t1" });
    getVisibleAssigneeNames.mockReset().mockResolvedValue(undefined);
  });

  it("rejects an anonymous request", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(401);
  });

  it("serves the bytes for a visible message", async () => {
    findFirst.mockResolvedValue({ text: "hi", attachmentUrl: `data:image/png;base64,${png}`, attachmentName: "a.png", attachmentMime: "image/png" });
    const response = await GET(req(), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("fake-png-bytes");
  });

  it("scopes the lookup to the tenant and, for non-owners, to their visible conversations", async () => {
    getVisibleAssigneeNames.mockResolvedValue(["Sara"]);
    findFirst.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
    const where = findFirst.mock.calls[0][0].where;
    expect(where.conversation).toEqual({ tenantId: "t1", assignee: { in: ["Sara"] } });
  });

  it("hides the attachment of a deleted message and non-inline URLs", async () => {
    findFirst.mockResolvedValue({ text: "تم حذف هذه الرسالة", attachmentUrl: `data:image/png;base64,${png}`, attachmentName: "", attachmentMime: "" });
    expect((await GET(req(), ctx)).status).toBe(404);
    findFirst.mockResolvedValue({ text: "hi", attachmentUrl: "https://cdn.example.test/a.png", attachmentName: "", attachmentMime: "" });
    expect((await GET(req(), ctx)).status).toBe(404);
  });

  it("never serves a customer-sent html file as html", async () => {
    findFirst.mockResolvedValue({ text: "x", attachmentUrl: `data:text/html;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`, attachmentName: "evil.html", attachmentMime: "text/html" });
    const response = await GET(req(), ctx);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
  });
});
