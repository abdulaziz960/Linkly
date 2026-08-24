"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import CustomSelect from "../components/CustomSelect";

const teamSizeOptions = [
  { value: "1", label: "1" },
  { value: "2-5", label: "2-5" },
  { value: "6-15", label: "6-15" },
  { value: "16+", label: "16+" }
];

const channels = [
  { value: "whatsapp", label: "واتساب" },
  { value: "instagram", label: "إنستغرام" },
  { value: "telegram", label: "تيليجرام" },
  { value: "email", label: "البريد الإلكتروني" },
  { value: "tiktok", label: "تيك توك (بعد الاعتماد)" }
];

export default function SignupForm() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(["whatsapp"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      companyName: form.get("companyName"), ownerName: form.get("ownerName"), ownerEmail: form.get("ownerEmail"), phone: form.get("phone"), teamSize: form.get("teamSize"), channels: selected, website: form.get("website")
    }) });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      message?: string;
      data?: { message?: string; activationUrl?: string; emailSent?: boolean };
    };
    setLoading(false);
    if (!response.ok) return setError(payload.error || payload.message || "تعذر إنشاء الحساب");
    if (payload.data?.activationUrl) return router.push(payload.data.activationUrl.replace(location.origin, ""));
    const delivery = payload.data?.emailSent === false ? "failed" : "sent";
    router.push(`/signup/success?email=${encodeURIComponent(String(form.get("ownerEmail") || ""))}&delivery=${delivery}`);
  }

  return <form className="journey-form" onSubmit={submit}>
    <label>اسم النشاط التجاري<input name="companyName" required maxLength={120} autoComplete="organization" placeholder="مثال: شركة سما" /></label>
    <label>اسمك<input name="ownerName" required maxLength={100} autoComplete="name" placeholder="الاسم الكامل" /></label>
    <label>البريد الإلكتروني<input name="ownerEmail" type="email" required maxLength={254} autoComplete="email" placeholder="name@company.sa" /></label>
    <label className="signup-honeypot" aria-hidden="true">الموقع الإلكتروني<input name="website" tabIndex={-1} autoComplete="off" /></label>
    <details className="signup-options">
      <summary>تخصيص التجربة <span>اختياري</span></summary>
      <div className="signup-options-body">
        <div className="form-pair"><label>رقم الجوال<input name="phone" inputMode="tel" maxLength={30} autoComplete="tel" placeholder="05xxxxxxxx" /></label><label>حجم الفريق<CustomSelect name="teamSize" defaultValue="2-5" options={teamSizeOptions} /></label></div>
        <fieldset><legend>القنوات التي تريد تجربتها</legend><div className="channel-choices">{channels.map(channel => <button className={selected.includes(channel.value) ? "selected" : ""} type="button" key={channel.value} aria-pressed={selected.includes(channel.value)} onClick={() => setSelected(current => current.includes(channel.value) ? current.filter(item => item !== channel.value) : [...current, channel.value])}>{channel.label}</button>)}</div></fieldset>
      </div>
    </details>
    {error ? <p className="journey-error" role="alert">{error}</p> : null}
    <button className="journey-submit" disabled={loading}>{loading ? "جاري تجهيز مساحتك..." : "ابدأ تجربتي مجانًا"}</button>
  </form>;
}
