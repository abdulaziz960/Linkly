import { describe, expect, it } from "vitest";
import { formatWaiting, slaInfo } from "../app/linkly-admin007/support/support-sla";

const NOW = new Date("2026-10-15T12:00:00Z").getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const ticket = (overrides: Partial<Parameters<typeof slaInfo>[0]>) => ({ status: "new", priority: "normal", createdAt: ago(10), lastCustomerReplyAt: "", ...overrides });

describe("slaInfo", () => {
  it("is ok / at risk / breached against the priority target", () => {
    expect(slaInfo(ticket({ createdAt: ago(60) }), NOW).state).toBe("ok");
    expect(slaInfo(ticket({ createdAt: ago(400) }), NOW).state).toBe("at_risk");
    expect(slaInfo(ticket({ createdAt: ago(500) }), NOW).state).toBe("breached");
  });

  it("uses a tighter target for urgent tickets", () => {
    expect(slaInfo(ticket({ priority: "urgent", createdAt: ago(61) }), NOW).state).toBe("breached");
    expect(slaInfo(ticket({ priority: "low", createdAt: ago(61) }), NOW).state).toBe("ok");
  });

  it("measures from the latest customer message when there is one", () => {
    const info = slaInfo(ticket({ createdAt: ago(900), lastCustomerReplyAt: ago(30), status: "waiting_support" }), NOW);
    expect(info).toMatchObject({ state: "ok", waitingMinutes: 30 });
  });

  it("has no SLA for tickets not waiting on support", () => {
    for (const status of ["waiting_customer", "in_progress", "resolved", "closed"]) {
      expect(slaInfo(ticket({ status, createdAt: ago(5000) }), NOW).state).toBe("none");
    }
  });

  it("ignores unparseable dates", () => {
    expect(slaInfo(ticket({ createdAt: "", lastCustomerReplyAt: "" }), NOW).state).toBe("none");
  });
});

describe("formatWaiting", () => {
  it("formats minutes, hours and days", () => {
    expect(formatWaiting(45)).toBe("45 د");
    expect(formatWaiting(200)).toBe("3 س 20 د");
    expect(formatWaiting(180)).toBe("3 س");
    expect(formatWaiting(60 * 28)).toBe("1 ي 4 س");
  });
});
