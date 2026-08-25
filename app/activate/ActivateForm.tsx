"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const copy = {
  ar: {
    newPassword: "كلمة السر الجديدة",
    confirmPassword: "تأكيد كلمة السر",
    mismatch: "كلمتا السر غير متطابقتين",
    genericError: "تعذر تفعيل الحساب",
    submitting: "جاري التفعيل...",
    submit: "تفعيل الحساب"
  },
  en: {
    newPassword: "New password",
    confirmPassword: "Confirm password",
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
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />
      </label>
      <label>
        {text.confirmPassword}
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={8}
        />
      </label>

      {error ? <p className="login-error">{error}</p> : null}

      <button className="login-submit" type="submit" disabled={loading || !token}>
        {loading ? text.submitting : text.submit}
      </button>
    </form>
  );
}
