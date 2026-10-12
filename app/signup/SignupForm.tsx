"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CustomSelect from "../components/CustomSelect";

const teamSizeOptions = [
  { value: "1", label: "1" },
  { value: "2-5", label: "2-5" },
  { value: "6-15", label: "6-15" },
  { value: "16+", label: "16+" }
];

const businessTypes = {
  ar: [
    { value: "", label: "اختر نوع النشاط" },
    { value: "real_estate", label: "عقار وتطوير عقاري" },
    { value: "retail", label: "متاجر وتجزئة" },
    { value: "ecommerce", label: "متجر إلكتروني" },
    { value: "restaurant", label: "مطاعم ومقاهي" },
    { value: "healthcare", label: "عيادات وصحة" },
    { value: "beauty", label: "صالونات وتجميل" },
    { value: "education", label: "تعليم وتدريب" },
    { value: "automotive", label: "سيارات وخدماتها" },
    { value: "travel", label: "سفر وسياحة" },
    { value: "professional_services", label: "خدمات مهنية" },
    { value: "other", label: "نشاط آخر" }
  ],
  en: [
    { value: "", label: "Choose business type" },
    { value: "real_estate", label: "Real estate and property development" },
    { value: "retail", label: "Retail" },
    { value: "ecommerce", label: "E-commerce" },
    { value: "restaurant", label: "Restaurants and cafes" },
    { value: "healthcare", label: "Clinics and healthcare" },
    { value: "beauty", label: "Beauty and salons" },
    { value: "education", label: "Education and training" },
    { value: "automotive", label: "Automotive" },
    { value: "travel", label: "Travel and tourism" },
    { value: "professional_services", label: "Professional services" },
    { value: "other", label: "Other business" }
  ]
};

const channels = {
  ar: [
    { value: "whatsapp", label: "واتساب" },
    { value: "instagram", label: "إنستغرام" },
    { value: "telegram", label: "تيليجرام" },
    { value: "email", label: "البريد الإلكتروني" },
    { value: "tiktok", label: "تيك توك" }
  ],
  en: [
    { value: "whatsapp", label: "WhatsApp" },
    { value: "instagram", label: "Instagram" },
    { value: "telegram", label: "Telegram" },
    { value: "email", label: "Email" },
    { value: "tiktok", label: "TikTok (account linking available)" }
  ]
};

const copy = {
  ar: {
    companyName: "اسم النشاط التجاري",
    companyNamePlaceholder: "مثال: شركة سما",
    businessType: "نوع النشاط",
    ownerName: "اسمك",
    ownerNamePlaceholder: "الاسم الكامل",
    email: "البريد الإلكتروني",
    website: "الموقع الإلكتروني",
    customizeSummary: "تخصيص التجربة",
    optional: "اختياري",
    phone: "رقم الجوال",
    phonePlaceholder: "05xxxxxxxx",
    teamSize: "حجم الفريق",
    channelsLegend: "القنوات التي تريد تجربتها",
    termsPrefix: "أوافق على",
    termsOf: "شروط الاستخدام",
    and: "و",
    privacyOf: "سياسة الخصوصية",
    termsRequired: "يجب الموافقة على شروط الاستخدام وسياسة الخصوصية",
    submitting: "جاري تجهيز مساحتك...",
    submit: "ابدأ تجربتي مجانًا",
    genericError: "تعذر إنشاء الحساب"
  },
  en: {
    companyName: "Business name",
    companyNamePlaceholder: "e.g. Sama Company",
    businessType: "Business type",
    ownerName: "Your name",
    ownerNamePlaceholder: "Full name",
    email: "Email",
    website: "Website",
    customizeSummary: "Customize your trial",
    optional: "Optional",
    phone: "Phone number",
    phonePlaceholder: "05xxxxxxxx",
    teamSize: "Team size",
    channelsLegend: "Channels you want to try",
    termsPrefix: "I agree to the",
    termsOf: "Terms of Service",
    and: "and",
    privacyOf: "Privacy Policy",
    termsRequired: "You must agree to the Terms of Service and Privacy Policy",
    submitting: "Setting up your workspace...",
    submit: "Start my free trial",
    genericError: "Couldn't create the account"
  }
};

export default function SignupForm({ lang = "ar", planId, googleProfile = null }: { lang?: "ar" | "en"; planId?: string; googleProfile?: { email: string; name: string } | null }) {
  const router = useRouter();
  const text = copy[lang];
  const channelOptions = channels[lang];
  const businessTypeOptions = businessTypes[lang];
  const [selected, setSelected] = useState<string[]>(["whatsapp"]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!termsAccepted) return setError(text.termsRequired);
    const form = new FormData(event.currentTarget);
    if (!form.get("businessType")) return setError(lang === "en" ? "Choose your business type." : "اختر نوع النشاط.");
    setLoading(true); setError("");
    const response = await fetch("/api/trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      companyName: form.get("companyName"), businessType: form.get("businessType"), ownerName: form.get("ownerName"), ownerEmail: form.get("ownerEmail"), phone: form.get("phone"), teamSize: form.get("teamSize"), channels: selected, website: form.get("website"), termsAccepted, planId, googleSignup: Boolean(googleProfile)
    }) });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      message?: string;
      data?: { message?: string; activationUrl?: string; emailSent?: boolean; redirectTo?: string };
    };
    setLoading(false);
    // The backend only returns Arabic error messages today, so an
    // English-language signup still shows an Arabic error string here.
    if (!response.ok) return setError(payload.error || payload.message || text.genericError);
    if (payload.data?.redirectTo) return router.push(payload.data.redirectTo);
    if (payload.data?.activationUrl) return router.push(payload.data.activationUrl.replace(location.origin, ""));
    const delivery = payload.data?.emailSent === false ? "failed" : "sent";
    router.push(`/signup/success?email=${encodeURIComponent(String(form.get("ownerEmail") || ""))}&delivery=${delivery}${lang === "en" ? "&lang=en" : ""}`);
  }

  return <form className="journey-form" onSubmit={submit}>
    <label>{text.companyName}<input name="companyName" required maxLength={120} autoComplete="organization" placeholder={text.companyNamePlaceholder} /></label>
    <label>{text.businessType}<CustomSelect name="businessType" defaultValue="" options={businessTypeOptions} /></label>
    <label>{text.ownerName}<input name="ownerName" required maxLength={100} autoComplete="name" defaultValue={googleProfile?.name} placeholder={text.ownerNamePlaceholder} /></label>
    <label>{text.email}<input name="ownerEmail" type="email" required maxLength={254} autoComplete="email" defaultValue={googleProfile?.email} readOnly={Boolean(googleProfile)} placeholder="name@company.sa" /></label>
    <label>{text.phone}<input name="phone" type="tel" required inputMode="tel" maxLength={30} autoComplete="tel" pattern="^(00966|\+966|966|0)?5\d{8}$" title={text.phonePlaceholder} placeholder={text.phonePlaceholder} /></label>
    <label className="signup-honeypot" aria-hidden="true">{text.website}<input name="website" tabIndex={-1} autoComplete="off" /></label>
    <details className="signup-options">
      <summary>{text.customizeSummary} <span>{text.optional}</span></summary>
      <div className="signup-options-body">
        <div className="form-pair"><label>{text.teamSize}<CustomSelect name="teamSize" defaultValue="2-5" options={teamSizeOptions} /></label></div>
        <fieldset><legend>{text.channelsLegend}</legend><div className="channel-choices">{channelOptions.map(channel => <button className={selected.includes(channel.value) ? "selected" : ""} type="button" key={channel.value} aria-pressed={selected.includes(channel.value)} onClick={() => setSelected(current => current.includes(channel.value) ? current.filter(item => item !== channel.value) : [...current, channel.value])}>{channel.label}</button>)}</div></fieldset>
      </div>
    </details>
    <label className="signup-terms">
      <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required />
      <span>
        {text.termsPrefix} <Link href={lang === "en" ? "/en/terms" : "/terms"} target="_blank" rel="noopener noreferrer">{text.termsOf}</Link> {text.and} <Link href={lang === "en" ? "/en/privacy" : "/privacy"} target="_blank" rel="noopener noreferrer">{text.privacyOf}</Link>
      </span>
    </label>
    {error ? <p className="journey-error" role="alert">{error}</p> : null}
    <button className="journey-submit" disabled={loading || !termsAccepted}>{loading ? text.submitting : text.submit}</button>
  </form>;
}
