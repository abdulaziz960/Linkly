"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { isTrialEligiblePlan } from "../../lib/trial-plan";
import type { ReactNode } from "react";
import { useLanguage } from "./i18n";
import type { PlanAccessData } from "../../lib/plan-access";
import { upgradeTargetForView, upgradeTargetForChannel } from "../../lib/plan-access";
import type { ChannelKey } from "../../lib/channel-catalog";
import type { ViewKey } from "./types";

type UpgradePrompt = { title: string; description: string; targetPlan: string };

type PlanAccessContextValue = {
  access: PlanAccessData;
  isViewLocked: (view: ViewKey) => boolean;
  isChannelLocked: (channel: ChannelKey) => boolean;
  /** Opens the "upgrade your plan" popup. */
  requestUpgrade: (prompt: UpgradePrompt) => void;
  promptForView: (view: ViewKey, label: string) => void;
  promptForChannel: (channel: ChannelKey, label: string) => void;
};

const OPEN_ACCESS: PlanAccessData = { planName: "", lockedViews: [], allowedChannels: "*", botNodeTypes: "*", botMaxSteps: null, basicReports: false, reportsExcel: true, isTrial: false };

const PlanAccessContext = createContext<PlanAccessContextValue>({
  access: OPEN_ACCESS,
  isViewLocked: () => false,
  isChannelLocked: () => false,
  requestUpgrade: () => undefined,
  promptForView: () => undefined,
  promptForChannel: () => undefined
});

export function usePlanAccess() {
  return useContext(PlanAccessContext);
}

export function PlanAccessProvider({ access, children }: { access: PlanAccessData; children: ReactNode }) {
  const { t } = useLanguage();
  const [prompt, setPrompt] = useState<UpgradePrompt | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");

  // During the free trial the owner can simply try the plan that has the feature.
  async function tryPlan(planName: string) {
    setSwitching(true);
    setSwitchError("");
    try {
      const response = await fetch("/api/trial/switch-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: planName }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setSwitchError(result?.error || t("تعذر تفعيل التجربة", "Could not start the trial"));
        setSwitching(false);
        return;
      }
      window.location.reload();
    } catch {
      setSwitchError(t("تعذر تفعيل التجربة", "Could not start the trial"));
      setSwitching(false);
    }
  }

  const requestUpgrade = useCallback((next: UpgradePrompt) => setPrompt(next), []);

  const value = useMemo<PlanAccessContextValue>(() => ({
    access,
    isViewLocked: (view) => access.lockedViews.includes(view),
    isChannelLocked: (channel) => access.allowedChannels !== "*" && !access.allowedChannels.includes(channel),
    requestUpgrade,
    promptForView: (view, label) => setPrompt({
      title: t("هذه الميزة غير متاحة في باقتك", "This feature isn't in your plan"),
      description: t(`«${label}» غير متاحة في باقتك الحالية.`, `"${label}" isn't included in your current plan.`),
      targetPlan: upgradeTargetForView(view)
    }),
    promptForChannel: (channel, label) => setPrompt({
      title: t("باقتك لا تدعم الربط مع المنصة", "Your plan doesn't support connecting this platform"),
      description: t(`الربط مع ${label} غير متاح في باقتك الحالية.`, `Connecting ${label} isn't included in your current plan.`),
      targetPlan: upgradeTargetForChannel(channel)
    })
  }), [access, requestUpgrade, t]);

  return (
    <PlanAccessContext.Provider value={value}>
      {children}
      {prompt ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPrompt(null)}>
          <div className="account-modal upgrade-modal" role="dialog" aria-modal="true" aria-label={prompt.title} onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn icon-btn-close" type="button" aria-label={t("إغلاق", "Close")} onClick={() => setPrompt(null)}>×</button>
              <h2>{prompt.title}</h2>
            </header>
            <div className="account-modal-body upgrade-modal-body">
              <span className="upgrade-modal-lock" aria-hidden="true">🔒</span>
              <p>{prompt.description}</p>
              <p>
                {t("هذه الميزة متاحة بدءًا من ", "This feature is available from ")}
                <b>{prompt.targetPlan}</b>
                {access.isTrial ? t(". أنت في الفترة التجريبية، فيمكنك تجربتها الآن مجانًا.", ". You're on the free trial, so you can try it now for free.") : t(". رقِّ باقتك للاستمتاع بالمزايا.", ". Upgrade your plan to enjoy it.")}
              </p>
              {switchError ? <p className="form-error">{switchError}</p> : null}
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setPrompt(null)}>{t("لاحقًا", "Not now")}</button>
              {access.isTrial && isTrialEligiblePlan(prompt.targetPlan) ? (
                <button className="btn primary" type="button" disabled={switching} onClick={() => void tryPlan(prompt.targetPlan)}>
                  {switching ? t("جارٍ التفعيل...", "Switching...") : t(`جرّب ${prompt.targetPlan} الآن`, `Try ${prompt.targetPlan} now`)}
                </button>
              ) : (
                <Link className="btn primary" href="/billing">{t("ترقية الباقة", "Upgrade plan")}</Link>
              )}
            </footer>
          </div>
        </div>
      ) : null}
    </PlanAccessContext.Provider>
  );
}
