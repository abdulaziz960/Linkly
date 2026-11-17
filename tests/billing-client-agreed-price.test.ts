import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BillingClient from "../app/billing/BillingClient";

const plans = [
  { id: "p1", name: "باقة السعر الخاص", monthlyPrice: 199, employeeLimit: 3, allowedChannels: "*", messageQuota: 0 },
  { id: "p2", name: "باقة أخرى", monthlyPrice: 349, employeeLimit: 5, allowedChannels: "*", messageQuota: 0 }
];

const render = (subscription: Record<string, unknown> | null) =>
  renderToStaticMarkup(createElement(BillingClient, { plans, currentPlan: subscription ? String(subscription.plan) : "", currentSubscription: subscription, lang: "ar", isTestMode: false }));

describe("the plan cards of a client's own billing page", () => {
  it("show the price agreed with the client on their own plan, and the usual price on every other", () => {
    const html = render({ plan: "باقة السعر الخاص", status: "نشط", renewalAt: "2020-01-01", billingCycle: "شهري", customPrice: 149, customPriceCycle: "شهري", customPricePlan: "باقة السعر الخاص" });
    const [first, second] = html.split("<article").slice(1);
    expect(first).toContain("<b>149</b>");
    expect(first).toContain('data-agreed-price="true"');
    expect(first).toContain("سعرك الخاص المتفق عليه");
    expect(second).toContain("<b>349</b>");
    expect(second).not.toContain("data-agreed-price");
    expect(html.match(/data-agreed-price/g)).toHaveLength(1);
  });

  it("show the usual price when the agreed one was for another plan or cycle, or there is none", () => {
    for (const subscription of [
      { plan: "باقة السعر الخاص", status: "نشط", billingCycle: "شهري", customPrice: 149, customPriceCycle: "سنوي", customPricePlan: "باقة السعر الخاص" },
      { plan: "باقة السعر الخاص", status: "نشط", billingCycle: "شهري", customPrice: 149, customPriceCycle: "شهري", customPricePlan: "باقة قديمة" },
      { plan: "باقة السعر الخاص", status: "نشط", billingCycle: "شهري", customPrice: 0, customPriceCycle: "", customPricePlan: "" },
      null
    ]) {
      const html = render(subscription);
      expect(html).toContain("<b>199</b>");
      expect(html).not.toContain("data-agreed-price");
    }
  });
});
