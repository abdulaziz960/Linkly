import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { resolvePublicUrl } from "./url-safety";

export class UnsafePublicUrlError extends Error {}

function responseBody(stream: Readable, source: Readable) {
  let finished = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.pause();
      stream.on("data", (chunk: Buffer) => {
        if (finished) return;
        controller.enqueue(chunk);
        if ((controller.desiredSize ?? 0) <= 0) stream.pause();
      });
      stream.once("end", () => { if (!finished) { finished = true; controller.close(); } });
      stream.once("error", error => { if (!finished) { finished = true; controller.error(error); } });
      stream.once("close", () => { if (!finished) { finished = true; controller.error(new Error("Response stream closed before completion")); } });
    },
    pull() { stream.resume(); },
    cancel() { finished = true; stream.destroy(); source.destroy(); }
  });
}

/** Server-side fetch for tenant-controlled destinations. Never follows redirects. */
export async function safePublicFetch(rawUrl: string, init: { method?: "GET" | "POST"; headers?: HeadersInit; body?: string; signal?: AbortSignal; redirect?: "manual" } = {}): Promise<Response> {
  init.signal?.throwIfAborted();
  const target = await resolvePublicUrl(rawUrl);
  if (!target) throw new UnsafePublicUrlError("Destination is not publicly routable");
  init.signal?.throwIfAborted();
  const { url, addresses } = target;
  // Node must never perform a second resolver lookup. This callback returns only
  // addresses validated above, while the original URL retains Host and TLS SNI.
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
  const headers = new Headers(init.headers);
  headers.set("accept-encoding", "identity");
  headers.delete("host");
  const options = {
    method: init.method || "GET", headers: Object.fromEntries(headers),
    lookup, agent: false as const, autoSelectFamily: false, signal: init.signal
  };
  return new Promise<Response>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, options, (incoming) => {
      const responseHeaders = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      const encoding = responseHeaders.get("content-encoding")?.toLowerCase();
      const decoder = encoding === "gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress() : encoding === "deflate" ? createInflate() : null;
      let stream: Readable = incoming;
      if (decoder) {
        incoming.on("error", error => decoder.destroy(error));
        decoder.on("close", () => { if (!incoming.complete) incoming.destroy(); });
        stream = incoming.pipe(decoder);
        responseHeaders.delete("content-encoding");
        responseHeaders.delete("content-length");
      }
      const status = incoming.statusCode || 502;
      const noBody = [204, 205, 304].includes(status);
      if (noBody) incoming.resume();
      resolve(new Response(noBody ? null : responseBody(stream, incoming), { status, headers: responseHeaders }));
    });
    request.on("error", reject);
    request.end(init.body);
  });
}
