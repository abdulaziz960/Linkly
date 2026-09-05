"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useStoredLanguage } from "../../useStoredLanguage";
import { developmentStatusLabel, developmentStatusBadgeClass } from "../../../lib/development";

type FeatureRequest = {
  id: string;
  title: string;
  description: string;
  status: string;
  rejectionReason: string;
  createdAt: string;
};

export default function DevelopmentPageClient() {
  const [lang] = useStoredLanguage("ar");
  const isEnglish = lang === "en";
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/development/requests");
    const json = await response.json();
    if (json.ok) setRequests(json.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    setError("");
    if (!title.trim() || !description.trim()) {
      setError(isEnglish ? "Please fill in both fields." : "الرجاء تعبئة العنوان والوصف.");
      return;
    }
    setSubmitting(true);
    const response = await fetch("/api/development/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description })
    });
    const json = await response.json();
    setSubmitting(false);
    if (!json.ok) {
      setError(json.error || (isEnglish ? "Something went wrong." : "حدث خطأ ما."));
      return;
    }
    setTitle("");
    setDescription("");
    load();
  }

  return (
    <main className="development-page" dir={isEnglish ? "ltr" : "rtl"}>
      <header className="development-header">
        <Link href="/dashboard" className="development-back">
          {isEnglish ? "← Back to dashboard" : "→ العودة للوحة العميل"}
        </Link>
        <div className="development-header-brand">
          <Image src="/assets/linkly-logo.png" alt="" width={56} height={31} />
          <b>Linkly</b>
        </div>
      </header>

      <section className="development-hero">
        <h1>{isEnglish ? "Platform development" : "تطوير المنصة"}</h1>
        <p>
          {isEnglish
            ? "Have an idea or a feature you'd like added to Linkly? Suggest it here and track its status."
            : "عندك فكرة أو ميزة تحب تُضاف لـ Linkly؟ اقترحها هنا وتابع حالتها."}
        </p>
      </section>

      <section className="development-form-section">
        <h2>{isEnglish ? "Suggest a new idea" : "اقترح فكرة جديدة"}</h2>
        <input
          className="development-input"
          placeholder={isEnglish ? "Idea title" : "عنوان الفكرة"}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
        />
        <textarea
          className="development-textarea"
          placeholder={isEnglish ? "Describe your idea..." : "اشرح فكرتك بالتفصيل..."}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          maxLength={4000}
        />
        {error ? <p className="development-error">{error}</p> : null}
        <button type="button" className="development-cta-primary" onClick={submit} disabled={submitting}>
          {submitting ? (isEnglish ? "Sending…" : "جاري الإرسال…") : isEnglish ? "Submit idea" : "إرسال الفكرة"}
        </button>
      </section>

      <section className="development-list-section">
        <h2>{isEnglish ? "My suggestions" : "اقتراحاتي"}</h2>
        {loading ? (
          <div className="development-empty-state"><p>{isEnglish ? "Loading…" : "جاري التحميل…"}</p></div>
        ) : requests.length === 0 ? (
          <div className="development-empty-state">
            <p>{isEnglish ? "You haven't suggested any ideas yet." : "لم تقترح أي فكرة بعد."}</p>
          </div>
        ) : (
          <div className="development-cards">
            {requests.map((item) => (
              <div key={item.id} className="development-card">
                <div className="development-card-head">
                  <h3>{item.title}</h3>
                  <span className={`development-badge ${developmentStatusBadgeClass(item.status)}`}>
                    {developmentStatusLabel(item.status, lang)}
                  </span>
                </div>
                <p className="development-card-description">{item.description}</p>
                {item.status === "rejected" && item.rejectionReason ? (
                  <p className="development-card-reason">
                    {isEnglish ? "Reason: " : "السبب: "}
                    {item.rejectionReason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
