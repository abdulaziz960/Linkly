"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordForm() {
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
    setMessage(data.message || "إذا كان البريد الإلكتروني مسجّلاً لدينا، أرسلنا رابط إعادة تعيين كلمة المرور إليه.");
    if (data.activationUrl) setActivationUrl(data.activationUrl);
  }

  if (message) {
    return (
      <div className="login-form">
        <p className="login-copy" style={{ margin: 0 }}>{message}</p>
        {activationUrl ? (
          <a className="login-submit" href={activationUrl} style={{ textDecoration: "none", textAlign: "center" }}>
            فتح رابط إعادة التعيين
          </a>
        ) : null}
        <a href="/login" style={{ textAlign: "center", fontWeight: 800 }}>
          الرجوع لتسجيل الدخول
        </a>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        البريد الإلكتروني
        <input
          type="email"
          name="email"
          placeholder="name@company.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <button className="login-submit" type="submit" disabled={loading}>
        {loading ? "جاري الإرسال..." : "إرسال رابط إعادة التعيين"}
      </button>

      <a href="/login" style={{ textAlign: "center", fontWeight: 800 }}>
        الرجوع لتسجيل الدخول
      </a>
    </form>
  );
}
