"use client";

import { FormEvent, useState } from "react";

const MailIcon = (
  <svg className="login-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>
);

const copy = {
  ar: {
    email: "البريد الإلكتروني",
    submit: "إرسال رابط إعادة التعيين",
    submitting: "جاري الإرسال...",
    backToLogin: "الرجوع لتسجيل الدخول",
    openResetLink: "فتح رابط إعادة التعيين",
    defaultMessage: "إذا كان البريد الإلكتروني مسجّلاً لدينا، أرسلنا رابط إعادة تعيين كلمة المرور إليه."
  },
  en: {
    email: "Email",
    submit: "Send reset link",
    submitting: "Sending...",
    backToLogin: "Back to sign in",
    openResetLink: "Open reset link",
    defaultMessage: "If this email is registered with us, we sent a password reset link to it."
  }
} as const;

export default function ForgotPasswordForm({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const text = copy[lang];
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activationUrl, setActivationUrl] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setActivationUrl("");

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await response.json().catch(() => ({})) as { message?: string; activationUrl?: string };

    setLoading(false);
    // The backend only returns Arabic messages today, so an English-language
    // request still shows the Arabic message here if the API returned one.
    setMessage(data.message || text.defaultMessage);
    if (data.activationUrl) setActivationUrl(data.activationUrl);
  }

  if (message) {
    return (
      <div className="login-form">
        <p className="login-copy" style={{ margin: 0 }}>{message}</p>
        {activationUrl ? (
          <a className="login-submit" href={activationUrl} style={{ textDecoration: "none", textAlign: "center" }}>
            {text.openResetLink}
          </a>
        ) : null}
        <a href="/login" style={{ textAlign: "center", fontWeight: 800 }}>
          {text.backToLogin}
        </a>
      </div>
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

      <button className="login-submit" type="submit" disabled={loading}>
        {loading ? text.submitting : text.submit}
      </button>

      <a href="/login" style={{ textAlign: "center", fontWeight: 800 }}>
        {text.backToLogin}
      </a>
    </form>
  );
}
