"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const copy = {
  ar: {
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    remember: "تذكرني",
    forgot: "نسيت كلمة المرور؟",
    submit: "تسجيل الدخول",
    submitting: "جاري الدخول...",
    genericError: "تعذر تسجيل الدخول",
    twoFactorTitle: "التحقق بخطوتين",
    twoFactorBody: "أرسلنا رمزاً مكوناً من 6 أرقام إلى بريدك الإلكتروني.",
    codeLabel: "الرمز",
    verify: "تأكيد",
    verifying: "جاري التأكيد...",
    resend: "لم يصلك الرمز؟ إعادة الإرسال",
    resending: "جاري الإرسال...",
    back: "رجوع"
  },
  en: {
    email: "Email",
    password: "Password",
    remember: "Remember me",
    forgot: "Forgot password?",
    submit: "Sign in",
    submitting: "Signing in...",
    genericError: "Couldn't sign in",
    twoFactorTitle: "Two-factor authentication",
    twoFactorBody: "We sent a 6-digit code to your email.",
    codeLabel: "Code",
    verify: "Verify",
    verifying: "Verifying...",
    resend: "Didn't get the code? Resend",
    resending: "Sending...",
    back: "Back"
  }
};

const MailIcon = (
  <svg className="login-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>
);
const LockIcon = (
  <svg className="login-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
const EyeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>
);
const EyeOffIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.86 19.86 0 0 1 5.06-5.94M9.9 4.24A10.6 10.6 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
);

function completeLogin(router: ReturnType<typeof useRouter>, data: { redirectTo?: string; onboardingRequired?: boolean }) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("audiencew:dashboard-active-view", data.onboardingRequired ? "settings" : "inbox");
    window.localStorage.removeItem("audiencew:dashboard-active-channel");
  }
  router.push(data.redirectTo || "/dashboard?view=inbox");
  router.refresh();
}

export default function LoginForm({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const router = useRouter();
  const text = copy[lang];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [pendingToken, setPendingToken] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password, remember })
    });

    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      // The backend only returns Arabic error messages today, so an
      // English-language login still shows an Arabic error string here.
      setError(data.message || text.genericError);
      return;
    }

    const data = await response.json().catch(() => ({})) as {
      redirectTo?: string;
      onboardingRequired?: boolean;
      twoFactorRequired?: boolean;
      pendingToken?: string;
    };
    if (data.twoFactorRequired && data.pendingToken) {
      setPendingToken(data.pendingToken);
      setCode("");
      setStep("2fa");
      return;
    }
    completeLogin(router, data);
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setVerifying(true);

    const response = await fetch("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken, code })
    });

    setVerifying(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message || text.genericError);
      return;
    }

    const data = await response.json().catch(() => ({}));
    completeLogin(router, data);
  }

  async function handleResend() {
    setError("");
    setResending(true);
    const response = await fetch("/api/auth/2fa/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken })
    });
    setResending(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.message || text.genericError);
    }
  }

  if (step === "2fa") {
    return (
      <form className="login-form" onSubmit={handleVerify}>
        <p>{text.twoFactorBody}</p>
        <label>
          {text.codeLabel}
          <div className="login-field">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              required
              autoFocus
            />
          </div>
        </label>

        <div className="login-options">
          <button type="button" className="login-text-link" onClick={() => { setStep("credentials"); setError(""); }}>{text.back}</button>
          <button type="button" className="login-text-link" onClick={handleResend} disabled={resending}>{resending ? text.resending : text.resend}</button>
        </div>

        {error ? <p className="login-error" role="alert">{error}</p> : null}

        <button className="login-submit" type="submit" disabled={verifying || code.length !== 6}>
          {verifying ? text.verifying : text.verify}
        </button>
      </form>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        {text.email}
        <div className="login-field">
          {MailIcon}
          <input
            type="email"
            name="email"
            placeholder="name@company.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
      </label>
      <label>
        {text.password}
        <div className="login-field">
          {LockIcon}
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="••••••••"
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

      <div className="login-options">
        <label className="remember-option">
          <input
            type="checkbox"
            name="remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>{text.remember}</span>
        </label>
        <a href="/forgot-password">{text.forgot}</a>
      </div>

      {error ? <p className="login-error" role="alert">{error}</p> : null}

      <button className="login-submit" type="submit" disabled={loading}>
        {loading ? text.submitting : text.submit}
      </button>
    </form>
  );
}
