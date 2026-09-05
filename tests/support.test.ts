import { describe, expect, it } from "vitest";
import {
  canReopen,
  excludeInternalMessages,
  isSupportCategory,
  isSupportPriority,
  isSupportStatus,
  statusAfterAgentReply,
  statusAfterCustomerReply,
  validateSupportAttachment
} from "../lib/support";

describe("support status transitions", () => {
  it("moves a fresh or open ticket to waiting_support on customer reply", () => {
    expect(statusAfterCustomerReply("new")).toBe("waiting_support");
    expect(statusAfterCustomerReply("waiting_customer")).toBe("waiting_support");
    expect(statusAfterCustomerReply("in_progress")).toBe("waiting_support");
  });

  it("reopens a resolved or closed ticket on customer reply", () => {
    expect(statusAfterCustomerReply("resolved")).toBe("open");
    expect(statusAfterCustomerReply("closed")).toBe("open");
  });

  it("moves an active ticket to waiting_customer on a customer-visible agent reply", () => {
    expect(statusAfterAgentReply("new")).toBe("waiting_customer");
    expect(statusAfterAgentReply("waiting_support")).toBe("waiting_customer");
  });

  it("does not reopen a resolved or closed ticket via an agent reply", () => {
    expect(statusAfterAgentReply("resolved")).toBe("resolved");
    expect(statusAfterAgentReply("closed")).toBe("closed");
  });
});

describe("reopen window", () => {
  it("allows reopening within the window and blocks it after", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const withinWindow = new Date("2026-01-05T00:00:00Z").toISOString();
    const outsideWindow = new Date("2025-12-01T00:00:00Z").toISOString();
    expect(canReopen(withinWindow, now)).toBe(true);
    expect(canReopen(outsideWindow, now)).toBe(false);
  });

  it("treats an empty timestamp as always reopenable", () => {
    expect(canReopen("")).toBe(true);
  });
});

describe("internal note filtering", () => {
  it("never lets an internal note through to the customer-facing view", () => {
    const messages = [
      { id: "1", isInternal: 0 },
      { id: "2", isInternal: 1 },
      { id: "3", isInternal: 0 }
    ];
    const visible = excludeInternalMessages(messages);
    expect(visible.map((m) => m.id)).toEqual(["1", "3"]);
  });
});

describe("attachment validation", () => {
  const tinyPngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  it("accepts a small image within the allow-list", () => {
    const result = validateSupportAttachment({ type: "image", name: "shot.png", dataUrl: tinyPngDataUrl, mimeType: "image/png" });
    expect("parsed" in result).toBe(true);
  });

  it("rejects a MIME type outside the allow-list for the declared attachment type", () => {
    const result = validateSupportAttachment({ type: "document", name: "shot.png", dataUrl: tinyPngDataUrl, mimeType: "image/png" });
    expect("error" in result).toBe(true);
  });

  it("rejects an incomplete attachment payload", () => {
    const result = validateSupportAttachment({ type: "image", name: "shot.png" });
    expect("error" in result).toBe(true);
  });

  it("rejects a filename over the length limit", () => {
    const result = validateSupportAttachment({
      type: "image",
      name: "a".repeat(181),
      dataUrl: tinyPngDataUrl,
      mimeType: "image/png"
    });
    expect("error" in result).toBe(true);
  });
});

describe("category/priority/status guards", () => {
  it("accepts only known values", () => {
    expect(isSupportStatus("open")).toBe(true);
    expect(isSupportStatus("bogus")).toBe(false);
    expect(isSupportPriority("urgent")).toBe(true);
    expect(isSupportPriority("critical")).toBe(false);
    expect(isSupportCategory("whatsapp")).toBe(true);
    expect(isSupportCategory("other-thing")).toBe(false);
  });
});
