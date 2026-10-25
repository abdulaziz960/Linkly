import { describe, expect, it } from "vitest";
import { answerConfirm, confirmDialog, dismissNotice, getDialogState, notify, registerDialogHost } from "../lib/ui-dialogs";

describe("ui-dialogs", () => {
  it("queues confirmations and resolves them in order", async () => {
    const release = registerDialogHost();
    const first = confirmDialog("حذف الوسم؟");
    const second = confirmDialog("Continue?");
    expect(getDialogState().confirm?.message).toBe("حذف الوسم؟");
    expect(getDialogState().confirm?.options.tone).toBe("danger");
    answerConfirm(true);
    expect(await first).toBe(true);
    expect(getDialogState().confirm?.message).toBe("Continue?");
    expect(getDialogState().confirm?.options.tone).toBe("default");
    answerConfirm(false);
    expect(await second).toBe(false);
    expect(getDialogState().confirm).toBeNull();
    release();
  });

  it("shows notices and dismisses them", () => {
    const release = registerDialogHost();
    notify("تعذر الحفظ", "error");
    const [notice] = getDialogState().notices.slice(-1);
    expect(notice.tone).toBe("error");
    dismissNotice(notice.id);
    expect(getDialogState().notices.find((item) => item.id === notice.id)).toBeUndefined();
    release();
  });

  it("ignores empty notices", () => {
    const release = registerDialogHost();
    const before = getDialogState().notices.length;
    notify("   ");
    expect(getDialogState().notices.length).toBe(before);
    release();
  });
});
