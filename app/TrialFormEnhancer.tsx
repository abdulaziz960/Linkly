"use client";

import { useEffect } from "react";

/**
 * The landing page markup is static HTML injected via
 * dangerouslySetInnerHTML (see page.tsx) - restructuring it into real JSX
 * risked breaking the single-root .landing wrapper the CSS depends on. This
 * component instead progressively enhances the existing #trialForm in
 * place: submitting it now creates a real tenant + login account and
 * redirects straight to activation, instead of doing nothing (it never had
 * a working submit handler wired up).
 */
export default function TrialFormEnhancer() {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("#trialForm");
    if (!form) return;

    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const defaultLabel = submitButton?.textContent || "ابدأ تجربتك الآن";

    let errorEl = form.parentElement?.querySelector<HTMLParagraphElement>(".trial-form-error") || null;

    function showError(message: string) {
      if (!errorEl) {
        errorEl = document.createElement("p");
        errorEl.className = "trial-form-error";
        errorEl.style.color = "#b91c1c";
        errorEl.style.fontWeight = "700";
        errorEl.style.fontSize = "13px";
        errorEl.style.margin = "12px 0 0";
        form?.insertAdjacentElement("afterend", errorEl);
      }
      errorEl.textContent = message;
    }

    async function handleSubmit(event: SubmitEvent) {
      event.preventDefault();
      if (!form) return;

      const formData = new FormData(form);
      const channels = formData.getAll("channels").map(String);

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "جاري إنشاء حسابك...";
      }
      if (errorEl) errorEl.textContent = "";

      const response = await fetch("/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: String(formData.get("company_name") || ""),
          ownerName: String(formData.get("contact_name") || ""),
          ownerEmail: String(formData.get("email") || ""),
          phone: String(formData.get("phone") || ""),
          teamSize: String(formData.get("team_size") || ""),
          channels
        })
      });

      const result = (await response.json().catch(() => null)) as {
        ok: boolean;
        error?: string;
        data?: { activationUrl?: string };
      } | null;

      if (!response.ok || !result?.ok) {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = defaultLabel;
        }
        showError(result?.error || "تعذر إنشاء الحساب، حاول مرة أخرى");
        return;
      }

      const activationUrl = result.data?.activationUrl;
      if (activationUrl) {
        if (submitButton) submitButton.textContent = "جاري تفعيل حسابك...";
        window.location.href = activationUrl;
        return;
      }

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultLabel;
      }
      showError("تم إنشاء الحساب لكن تعذر فتح رابط التفعيل تلقائيًا.");
    }

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, []);

  return null;
}
