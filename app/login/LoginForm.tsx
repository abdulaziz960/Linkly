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
    genericError: "تعذر تسجيل الدخول"
  },
  en: {
    email: "Email",
    password: "Password",
    remember: "Remember me",
    forgot: "Forgot password?",
    submit: "Sign in",
    submitting: "Signing in...",
    genericError: "Couldn't sign in"
  }
};

export default function LoginForm({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const router = useRouter();
  const text = copy[lang];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

    const data = await response.json().catch(() => ({})) as { redirectTo?: string; onboardingRequired?: boolean };
    if (typeof window !== "undefined") {
      window.localStorage.setItem("audiencew:dashboard-active-view", data.onboardingRequired ? "settings" : "inbox");
      window.localStorage.removeItem("audiencew:dashboard-active-channel");
    }
    router.push(data.redirectTo || "/dashboard?view=inbox");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        {text.email}
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
      <label>
        {text.password}
        <input
          type="password"
          name="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
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
