"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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
    intro: "أدخل كلمة سر حسابك الحالي لتأكيد الانضمام كموظف بالشركة الجديدة.",
    password: "كلمة السر",
    genericError: "تعذر تأكيد الانضمام",
    submitting: "جاري التأكيد...",
    submit: "تأكيد الانضمام",
    successHeading: "تم الانضمام بنجاح",
    successBody: (company: string) => `صار عندك عضوية جديدة${company ? ` بـ${company}` : ""}. سجّل دخولك واختر الشركة من قائمة "التبديل بين الشركات".`,
    login: "تسجيل الدخول"
  },
  en: {
    intro: "Enter your current account's password to confirm joining the new company as an employee.",
    password: "Password",
    genericError: "Couldn't confirm the invitation",
    submitting: "Confirming...",
    submit: "Confirm joining",
    successHeading: "You've joined",
    successBody: (company: string) => `You now have a membership${company ? ` at ${company}` : ""}. Log in and use "Switch Company" to pick it.`,
    login: "Log in"
  }
} as const;

export default function JoinWorkspaceForm({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const text = copy[lang];
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [joinedCompany, setJoinedCompany] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/join-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string; companyName?: string };
    setLoading(false);

    if (!response.ok) {
      setError(payload.message || text.genericError);
      return;
    }

    setJoinedCompany(payload.companyName || "");
  }

  if (joinedCompany !== null) {
    return (
      <div className="login-form">
        <p><strong>{text.successHeading}</strong></p>
        <p>{text.successBody(joinedCompany)}</p>
        <Link className="login-submit" href="/login">{text.login}</Link>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <p>{text.intro}</p>
      <label>
        {text.password}
        <div className="login-field">
          {LockIcon}
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
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
      </label>

      {error ? <p className="login-error">{error}</p> : null}

      <button className="login-submit" type="submit" disabled={loading || !token}>
        {loading ? text.submitting : text.submit}
      </button>
    </form>
  );
}
