import { describe, expect, it } from "vitest";
import {
  clearSentDraft, draftFor, holdAttachment, isGroupedMessage, keepNewestOnResize, releaseAttachment, restoreFailedText,
  setAttachmentSending, setDraft, type HeldAttachments
} from "../lib/chat-ui";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 20, 9, 0) + minutes * 60_000).toISOString();

describe("drafts belong to one conversation", () => {
  it("keeps what was typed for each conversation apart", () => {
    const drafts = setDraft({}, "a", { text: "رد لنورة" });
    expect(draftFor(drafts, "a")).toEqual({ text: "رد لنورة", mode: "reply" });
    expect(draftFor(drafts, "b")).toEqual({ text: "", mode: "reply" });
  });

  it("remembers the private note mode only where it was chosen", () => {
    const drafts = setDraft({}, "a", { mode: "note" });
    expect(draftFor(drafts, "a").mode).toBe("note");
    expect(draftFor(drafts, "b").mode).toBe("reply");
  });

  it("clears a draft after sending, unless more was typed meanwhile", () => {
    const drafts = setDraft({}, "a", { text: " أهلاً " });
    expect(draftFor(clearSentDraft(drafts, "a", "أهلاً"), "a").text).toBe("");
    const typedMore = setDraft(drafts, "a", { text: "أهلاً وسهلاً" });
    expect(draftFor(clearSentDraft(typedMore, "a", "أهلاً"), "a").text).toBe("أهلاً وسهلاً");
  });

  it("ignores changes when no conversation is open", () => {
    expect(setDraft({}, "", { text: "x" })).toEqual({});
  });
});

describe("an attachment waiting to be sent belongs to one conversation", () => {
  const forA = { name: "for-a.pdf" };
  const forB = { name: "for-b.pdf" };
  const none: HeldAttachments<{ name: string }> = {};

  it("holds one for each conversation", () => {
    const held = holdAttachment(holdAttachment(none, "a", forA), "b", forB);
    expect(held.a).toEqual({ attachment: forA, sending: false });
    expect(held.b).toEqual({ attachment: forB, sending: false });
  });

  it("keeps another customer's file when a slow send finishes", () => {
    const sending = setAttachmentSending(holdAttachment(none, "a", forA), "a", forA, true);
    const withB = holdAttachment(sending, "b", forB);
    expect(withB.b.sending).toBe(false);
    const done = releaseAttachment(withB, "a", forA);
    expect(done.a).toBeUndefined();
    expect(done.b).toEqual({ attachment: forB, sending: false });
  });

  it("does not drop or mark a newer file when an older one reports back", () => {
    const newer = { name: "newer.pdf" };
    const held = holdAttachment(holdAttachment(none, "a", forA), "a", newer);
    expect(releaseAttachment(held, "a", forA).a).toEqual({ attachment: newer, sending: false });
    expect(setAttachmentSending(held, "a", forA, true).a).toEqual({ attachment: newer, sending: false });
  });

  it("ignores a file picked with no conversation open", () => {
    expect(holdAttachment(none, "", forA)).toEqual({});
  });
});

describe("putting a failed message back in the reply box", () => {
  it("fills an empty box", () => {
    expect(restoreFailedText({ text: "  ", mode: "reply" }, "عرض السعر")).toBe("عرض السعر");
  });

  it("keeps what is already typed and adds the failed message under it", () => {
    expect(restoreFailedText({ text: "مسودتي ", mode: "reply" }, "عرض السعر")).toBe("مسودتي\nعرض السعر");
  });

  it("adds it only once", () => {
    expect(restoreFailedText({ text: "مسودتي\nعرض السعر", mode: "reply" }, "عرض السعر")).toBe("مسودتي\nعرض السعر");
    expect(restoreFailedText({ text: "عرض السعر", mode: "reply" }, "عرض السعر")).toBe("عرض السعر");
  });

  it("refuses while a private note is being written, so the note cannot go to the customer", () => {
    expect(restoreFailedText({ text: "ملاحظة داخلية", mode: "note" }, "عرض السعر")).toBeNull();
    expect(restoreFailedText({ text: "", mode: "note" }, "عرض السعر")).toBe("عرض السعر");
  });
});

describe("staying at the newest message when the thread changes height", () => {
  function setup(following: boolean) {
    const box = { scrollTop: 100, scrollHeight: 900 };
    let resize = () => {};
    const watched: unknown[] = [];
    let disconnected = false;
    class FakeObserver {
      constructor(callback: () => void) { resize = callback; }
      observe(target: unknown) { watched.push(target); }
      disconnect() { disconnected = true; }
    }
    const stop = keepNewestOnResize(box, () => following, FakeObserver);
    return { box, resize: () => resize(), watched, stop, isDisconnected: () => disconnected };
  }

  it("scrolls back down for a reader who was at the bottom", () => {
    const { box, resize, watched } = setup(true);
    expect(watched).toEqual([box]);
    resize();
    expect(box.scrollTop).toBe(900);
  });

  it("leaves someone reading older messages where they are", () => {
    const { box, resize } = setup(false);
    resize();
    expect(box.scrollTop).toBe(100);
  });

  it("stops watching when asked", () => {
    const { stop, isDisconnected } = setup(true);
    stop();
    expect(isDisconnected()).toBe(true);
  });
});

describe("grouping messages from the same side", () => {
  const base = { direction: "out", author: "سارة", createdAt: at(0) };

  it("groups a follow-up from the same author within five minutes", () => {
    expect(isGroupedMessage(base, { ...base, createdAt: at(4) })).toBe(true);
  });

  it("starts a new group after a pause, another author, another side or another day", () => {
    expect(isGroupedMessage(base, { ...base, createdAt: at(6) })).toBe(false);
    expect(isGroupedMessage(base, { ...base, author: "فهد", createdAt: at(1) })).toBe(false);
    expect(isGroupedMessage(base, { ...base, direction: "note", createdAt: at(1) })).toBe(false);
    // 20:58 and 21:01 UTC fall on two different days in Riyadh (UTC+3).
    expect(isGroupedMessage({ ...base, createdAt: "2026-11-20T20:58:00.000Z" }, { ...base, createdAt: "2026-11-20T21:01:00.000Z" })).toBe(false);
  });

  it("never groups with system lines or messages without a time", () => {
    expect(isGroupedMessage({ ...base, source: { type: "system_assignment" } }, { ...base, createdAt: at(1) })).toBe(false);
    expect(isGroupedMessage(base, { ...base, createdAt: "" })).toBe(false);
    expect(isGroupedMessage(undefined, base)).toBe(false);
  });
});
