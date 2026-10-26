/**
 * Chat attachments (images, voice notes, documents) are stored as base64 data
 * URLs in the message row. Sending those inline with every inbox refresh made
 * the conversation list ~2 MB and was most of the site's outbound traffic, so
 * the list now carries a short URL instead and the bytes are served by
 * app/api/conversations/[id]/messages/[messageId]/attachment/route.ts.
 */

const DATA_URL = /^data:([^;,]*)(?:;[^,]*)?;base64,([\s\S]*)$/i;

/** Types the browser may render inline. Everything else (html, svg, js, ...) is forced to download as opaque bytes. */
const INLINE_TYPES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
  "audio/ogg", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/aac", "audio/wav", "audio/webm", "audio/x-m4a", "audio/amr"
]);

export function isInlineDataUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("data:");
}

export function messageAttachmentPath(conversationId: string, messageId: string) {
  return `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/attachment`;
}

export function parseDataUrl(url: string): { mimeType: string; bytes: Buffer } | null {
  const match = DATA_URL.exec(url);
  if (!match) return null;
  return { mimeType: match[1].trim().toLowerCase(), bytes: Buffer.from(match[2], "base64") };
}

/**
 * Headers for serving user-supplied bytes from our own origin. A customer can
 * send anything, so a type outside the allow-list is never served as its own
 * type (an html/svg file opened directly would run script on our origin).
 */
export function attachmentResponseHeaders(mimeType: string, fileName: string, byteLength: number): Record<string, string> {
  const inline = INLINE_TYPES.has(mimeType);
  const safeName = fileName.replace(/[^\w.\- ؀-ۿ]/g, "_").slice(0, 120) || "attachment";
  return {
    "Content-Type": inline ? mimeType : "application/octet-stream",
    "Content-Length": String(byteLength),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // Immutable per message id; private so shared caches never hold customer media.
    "Cache-Control": "private, max-age=3600"
  };
}
