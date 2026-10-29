import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("dns", () => ({ promises: { lookup: mocks.lookup } }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { safePublicFetch, UnsafePublicUrlError } from "../lib/safe-public-fetch";
import { isPubliclyRoutableUrl } from "../lib/url-safety";

function response(body: Buffer = Buffer.from("ok"), status = 200, headers: string[] = []) {
  mocks.request.mockImplementation((_url: URL, _options: RequestOptions, callback: (incoming: IncomingMessage) => void) => {
    const request = new EventEmitter();
    return Object.assign(request, { end: vi.fn(() => {
      const stream = Object.assign(new PassThrough(), { statusCode: status, rawHeaders: headers, complete: true });
      callback(stream as unknown as IncomingMessage);
      stream.end(body);
    }) });
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  response();
});
it("pins the connection to the vetted result even if DNS would change on a second lookup", async () => {
  mocks.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
  const result = await safePublicFetch("https://merchant.example/webhook", { method: "POST", body: "{}" });
  const [url, options] = mocks.request.mock.calls[0] as [URL, RequestOptions];
  expect(url.hostname).toBe("merchant.example"); // Preserves native Host and TLS hostname verification.
  expect(options.agent).toBe(false);
  expect(options.rejectUnauthorized).not.toBe(false);
  const callback = vi.fn();
  options.lookup!("merchant.example", {}, callback);
  expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  const all = vi.fn(); options.lookup!("merchant.example", { all: true }, all);
  expect(all).toHaveBeenCalledWith(null, [{ address: "8.8.8.8", family: 4 }]);
  expect(mocks.lookup).toHaveBeenCalledTimes(1);
  expect(await result.text()).toBe("ok");
});
it.each(["http://127.0.0.1", "http://169.254.169.254", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://[::ffff:a9fe:a9fe]", "http://[fd00::1]", "file:///etc/passwd"])("blocks unsafe destination %s before connecting", async url => {
  await expect(safePublicFetch(url)).rejects.toBeInstanceOf(UnsafePublicUrlError);
  expect(mocks.request).not.toHaveBeenCalled();
});
it("rejects mixed public/private DNS answers and DNS failures", async () => {
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]);
  await expect(safePublicFetch("https://merchant.example")).rejects.toBeInstanceOf(UnsafePublicUrlError);
  mocks.lookup.mockRejectedValue(new Error("DNS failed"));
  expect(await isPubliclyRoutableUrl("https://merchant.example")).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
});
it("permits a public IPv6 literal and keeps manual redirect handling", async () => {
  response(Buffer.from("redirect"), 302, ["Location", "http://127.0.0.1/private"]);
  const redirect = await safePublicFetch("https://[2606:4700:4700::1111]/");
  expect(redirect.status).toBe(302);
  await redirect.body?.cancel();
  await expect(safePublicFetch(redirect.headers.get("location")!)).rejects.toBeInstanceOf(UnsafePublicUrlError);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("preserves decompression and request cancellation", async () => {
  response(gzipSync("feed content"), 200, ["Content-Encoding", "gzip", "Content-Length", "999"]);
  const controller = new AbortController();
  const result = await safePublicFetch("https://merchant.example/feed", { signal: controller.signal });
  expect(mocks.request.mock.calls[0][1].signal).toBe(controller.signal);
  expect(result.headers.get("content-encoding")).toBeNull();
  expect(await result.text()).toBe("feed content");
  mocks.request.mockClear(); controller.abort();
  await expect(safePublicFetch("https://merchant.example/feed", { signal: controller.signal })).rejects.toThrow();
  expect(mocks.request).not.toHaveBeenCalled();
});
