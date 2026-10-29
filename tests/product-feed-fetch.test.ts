import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ safeFetch: vi.fn(), allowed: vi.fn(async (url: string) => !url.includes("127.0.0.1")) }));
vi.mock("../lib/safe-public-fetch", () => ({ safePublicFetch: mocks.safeFetch }));
vi.mock("../lib/url-safety", () => ({ isPubliclyRoutableUrl: mocks.allowed }));
import { fetchFeedText } from "../lib/product-feed";
beforeEach(() => { vi.clearAllMocks(); mocks.safeFetch.mockReset(); });
it("downloads a legitimate feed using the pinned transport", async () => {
  mocks.safeFetch.mockResolvedValue(new Response("id,name\n1,Product"));
  expect(await fetchFeedText("https://merchant.example/feed")).toBe("id,name\n1,Product");
  expect(mocks.safeFetch).toHaveBeenCalledWith("https://merchant.example/feed", expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }));
});
it("refuses a redirect to a private destination before a second connection", async () => {
  mocks.safeFetch.mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
  await expect(fetchFeedText("https://merchant.example/feed")).rejects.toThrow();
  expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
});
it("rejects an oversized response and cancels its body", async () => {
  const response = new Response("small", { headers: { "content-length": "9000000" } });
  const cancel = vi.spyOn(response.body!, "cancel");
  mocks.safeFetch.mockResolvedValue(response);
  await expect(fetchFeedText("https://merchant.example/feed")).rejects.toThrow("8");
  expect(cancel).toHaveBeenCalled();
});
