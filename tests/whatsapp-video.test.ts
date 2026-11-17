import { describe, expect, it } from "vitest";
import { describeWhatsAppMessage } from "../lib/whatsapp-inbound-text";
import { attachmentResponseHeaders, parseByteRange } from "../lib/message-attachments";

describe("an incoming WhatsApp video", () => {
  it("shows as a video (or its caption) and lets the bot carry on, instead of 'not supported'", () => {
    expect(describeWhatsAppMessage({ type: "video", video: { id: "1", mime_type: "video/mp4" } })).toEqual({ text: "فيديو وارد", conversational: true });
    expect(describeWhatsAppMessage({ type: "video", video: { id: "1", caption: "هذا المنتج" } })).toEqual({ text: "هذا المنتج", conversational: true });
  });

  it("is served inline, as a playable file that accepts partial requests", () => {
    const headers = attachmentResponseHeaders("video/mp4", "video-1.mp4", 1000);
    expect(headers["Content-Type"]).toBe("video/mp4");
    expect(headers["Content-Disposition"]).toMatch(/^inline/);
    expect(headers["Accept-Ranges"]).toBe("bytes");
  });

  it("answers a Range header with the part asked for", () => {
    expect(parseByteRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=0-1", 1000)).toEqual({ start: 0, end: 1 });
    expect(parseByteRange("bytes=500-9999", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange("bytes=5-2", 1000)).toBeNull();
    expect(parseByteRange("items=0-1", 1000)).toBeNull();
  });
});
