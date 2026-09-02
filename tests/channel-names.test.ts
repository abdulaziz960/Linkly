import { describe, expect, it } from "vitest";
import { channelNames, getChannelName } from "../app/channel-names";

describe("channel names", () => {
  it("shows the Arabic channel name in the Arabic interface", () => {
    expect(getChannelName("instagram", "ar")).toBe("إنستغرام");
  });

  it("keeps every Arabic channel label free of English letters", () => {
    const arabicLabels = Object.values(channelNames).map((name) => name.ar);

    expect(arabicLabels.every((label) => !/[A-Za-z]/.test(label))).toBe(true);
  });
});
