"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LockIcon = (
  <svg className="login-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
const EyeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
);
const EyeOffIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.86 19.86 0 0 1 5.06-5.94M9.9 4.24A10.6 10.6 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
);

const copy = {
  ar: {
    newPassword: "كلمة السر الجديدة",
    confirmPassword: "تأكيد كلمة السر",
    passwordHint: "12 حرفاً على الأقل، وتتضمن حرفاً ورقماً",
    mismatch: "كلمتا السر غير متطابقتين",
    genericError: "تعذر تفعيل الحساب",
    submitting: "جاري التفعيل...",
    submit: "تفعيل الحساب"
  },
  en: {
    newPassword: "New password",
    confirmPassword: "Confirm password",
    passwordHint: "At least 12 characters, including a letter and a number",
    mismatch: "Passwords don't match",
    genericError: "Couldn't activate the account",
    submitting: "Activating...",
    submit: "Activate account"
  }
} as const;

export default function ActivateForm({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const text = copy[lang];
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(text.mismatch);
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    setLoading(false);

    if (!response.ok) {
      // The backend only returns Arabic error messages today, so an
      // English-language activation still shows an Arabic error string here.
      setError(payload.message || text.genericError);
      return;
    }

    router.push("/dashboard?view=settings&welcome=1");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        {text.newPassword}
        <div className="login-field">
          {LockIcon}
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={12}
          />
          <button
            type="button"
            className="login-toggle-visibility"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? (lang === "ar" ? "إخفاء كلمة المرور" : "Hide password") : (lang === "ar" ? "إظهار كلمة المرور" : "Show password")}
            aria-pressed={showPassword}
          >
            {showPassword ? EyeOffIcon : EyeIcon}
          </button>
        </div>
        <small>{text.passwordHint}</small>
      </label>
      <label>
        {text.confirmPassword}
        <div className="login-field">
          {LockIcon}
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={12}
          />
        </div>
      </label>

      {error ? <p className="login-error">{error}</p> : null}

      <button className="login-submit" type="submit" disabled={loading || !token}>
        {loading ? text.submitting : text.submit}
      </button>
    </form>
  );
}
