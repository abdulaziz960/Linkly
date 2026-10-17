"use client";

import Link from "next/link";
import InboxBackLink from "../components/InboxBackLink";
import Image from "next/image";
import { useRef, useState } from "react";
import guides from "./guides.json";

type Guide = (typeof guides)[number];
const categories = ["الكل", ...new Set(guides.map((guide) => guide.category))];
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u064B-\u065F\u0670ـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLowerCase();

export default function TutorialsClient() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("الكل");
  const [active, setActive] = useState<Guide>(guides[0]);
  const [videoError, setVideoError] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [playerNotice, setPlayerNotice] = useState("");
  const player = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const codeExample = "code" in active ? active.code : undefined;
  const filtered = guides.filter((guide) => (category === "الكل" || guide.category === category) && normalize(`${guide.title} ${guide.description} ${guide.category} ${guide.steps.map((step) => step.body).join(" ")}`).includes(normalize(query.trim())));

  function selectGuide(guide: Guide) {
    setActive(guide);
    setVideoError(false);
    setPlayerNotice("");
    setCurrentStep(0);
    dialog.current?.showModal();
  }

  function closeGuide() {
    player.current?.pause();
    dialog.current?.close();
  }

  function seek(index: number) {
    if (player.current) {
      player.current.currentTime = active.steps[index].start;
      setCurrentStep(index);
    }
  }

  return <main className="tutorials-page" dir="rtl">
    <header className="tutorials-header"><Link href="/dashboard?view=inbox" className="tutorials-brand" aria-label="لنكلي — مركز الشروحات"><Image src="/assets/linkly-logo.png" alt="شعار لنكلي" width={64} height={36} priority /><span className="tutorials-wordmark" dir="ltr">Linkly</span><span className="tutorials-brand-section">مركز الشروحات</span></Link><nav aria-label="التنقل"><InboxBackLink /></nav></header>
    <section className="tutorials-hero">
      <div><span className="tutorials-eyebrow tutorials-phrase-list"><span>تعلّم</span><span>طبّق</span><span>انطلق</span></span><h1>كل ميزة،<br /><em>بخطوات واضحة.</em></h1><p>من أول ربط للواتساب إلى أتمتة متابعة عملائك. شروحات قصيرة تساعدك تعرف وين تروح وكيف تبدأ.</p><a href="#tutorial-library" className="tutorials-primary">استكشف الشروحات <span aria-hidden="true">↓</span></a></div>
      <div className="tutorials-hero-art" aria-hidden="true"><span className="tutorials-art-label">مكتبة التعلّم</span><div className="tutorials-art-brand"><Image src="/assets/linkly-logo.png" alt="" width={90} height={50} /><b dir="ltr">Linkly</b></div><strong>تعلّم على لنكلي.</strong><span className="tutorials-art-description">من أول ربط، إلى آخر خطوة.</span><div className="tutorials-art-topics"><span>القنوات</span><span>الرد الآلي</span><span dir="ltr">API</span></div><div className="tutorials-mini-progress"><i /><i /><i /><i /></div></div>
    </section>
    <div className="tutorials-summary"><span><strong>{guides.length}</strong> شرحًا جاهزًا</span><span>أسهم توضيحية بدون صوت</span><span>تعلّم حسب وقتك</span></div>
    <dialog className="tutorials-dialog" ref={dialog} aria-labelledby="tutorial-title" onClose={() => player.current?.pause()} onCancel={() => player.current?.pause()} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeGuide(); } }}><header className="tutorials-dialog-header"><h2 id="tutorial-title">{active.title}</h2><button type="button" onClick={closeGuide} aria-label="إغلاق الشرح">✕</button></header><section className="tutorials-detail">
      {["salla", "zid", "shopify"].includes(active.id) ? <p className="tutorials-prerequisite" role="note"><strong>قبل الربط:</strong> ربط المتجر مستقل عن ربط واتساب. إذا ظهرت رسالة «بيانات التطبيق غير مضبوطة» يلزم إعداد تطبيق المتجر على الخادم أولًا. هذا المقطع يشرح مواضع الإعدادات؛ إتمام الربط يحتاج متجرًا مفوضًا.</p> : null}
      <div className="tutorials-video-wrap">
        <div className="tutorials-player-toolbar"><label className="tutorials-speed">سرعة الشرح<select defaultValue="1" key={active.id} onChange={(event) => { if (player.current) player.current.playbackRate = Number(event.target.value); }}><option value="0.75">بطيء 0.75×</option><option value="1">عادي 1×</option><option value="1.25">سريع 1.25×</option></select></label><button type="button" onClick={() => { const video = player.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null; if (video?.requestFullscreen) void video.requestFullscreen().catch(() => setPlayerNotice("استخدم زر ملء الشاشة داخل مشغل الفيديو، أو افتح المقطع مباشرة.")); else video?.webkitEnterFullscreen?.(); }}>تكبير الفيديو ⛶</button></div>
        <video key={active.id} ref={player} controls muted playsInline preload="none" poster={`/tutorials/${active.id}.jpg?v=fullscreen4`} aria-label={`شرح ${active.title}`} onError={() => setVideoError(true)} onTimeUpdate={() => setCurrentStep(Math.max(0, active.steps.findLastIndex((step) => step.start <= (player.current?.currentTime ?? 0))))}>
          <source src={`/tutorials/${active.id}.mp4?v=fullscreen4`} type="video/mp4" />
          <track kind="captions" src={`/tutorials/${active.id}.vtt?v=fullscreen4`} srcLang="ar" label="العربية" />
          متصفحك لا يدعم تشغيل الفيديو. يمكنك قراءة الخطوات أدناه.
        </video>
        {playerNotice ? <p role="status">{playerNotice} <a href={`/tutorials/${active.id}.mp4`}>افتح الفيديو</a></p> : null}
        {videoError ? <p role="alert">تعذر تشغيل المقطع. <a href={`/tutorials/${active.id}.mp4`}>افتح الفيديو مباشرة</a> أو تابع الخطوات المكتوبة.</p> : null}
        <p className="tutorials-video-note">شاشة كاملة وشرح بالأسهم بدون صوت، يبدأ من القائمة الجانبية. أوقف المقطع أو كبّره لتطبيق الخطوة.</p>
      </div>
      <div className="tutorials-instructions"><span className="tutorials-eyebrow tutorials-phrase-list"><span>{active.category}</span><span>{active.duration} ثانية</span></span><p>{active.description}</p><details key={active.id} className="tutorials-step-details"><summary>خطوات التطبيق <span>{active.steps.length} خطوات</span></summary><ol>{active.steps.map((step, index) => <li key={step.title} className={index === currentStep ? "is-current" : ""}><button type="button" onClick={() => seek(index)} aria-label={`انتقل إلى الخطوة ${index + 1}: ${step.title}`} aria-current={index === currentStep ? "step" : undefined}><span>{index + 1}</span><b>{step.title}</b></button><p>{step.body}</p></li>)}</ol></details>{codeExample ? <pre className="tutorials-code" dir="ltr"><code>{codeExample}</code></pre> : null}<Link className="tutorials-primary" href={`/dashboard?view=${active.view}`}>افتح صفحة الإعداد <span aria-hidden="true">←</span></Link><small>فتح الإعدادات وتنفيذها يخضع لصلاحيات حسابك وباقتك.</small></div>
    </section></dialog>
    <section id="tutorial-library" className="tutorials-library" aria-labelledby="library-title"><div className="tutorials-library-heading"><div><span className="tutorials-eyebrow">مكتبة الشروحات</span><h2 id="library-title">وش تبي تتعلّم اليوم؟</h2></div><label className="tutorials-search"><span>ابحث عن ميزة أو تكامل</span><input type="search" placeholder="ابحث: واتساب، سلة، الرد الآلي…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      <label className="tutorials-category-filter"><span>تصفّح حسب الموضوع</span><span className="tutorials-category-select"><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item === "الكل" ? "جميع الشروحات" : item}</option>)}</select><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span></label>
      <p className="tutorials-result-count" role="status">{filtered.length} شرح</p>
      <div className="tutorials-grid">{filtered.map((guide, index) => <button type="button" key={guide.id} className={`tutorials-card ${active.id === guide.id ? "is-selected" : ""}`} aria-haspopup="dialog" aria-pressed={active.id === guide.id} onClick={() => selectGuide(guide)}><div className={`tutorials-card-art tone-${index % 3}`}><Image src={`/tutorials/${guide.id}.jpg?v=fullscreen4`} alt="" fill sizes="(max-width: 560px) 100vw, (max-width: 850px) 50vw, 33vw" unoptimized /><span>{guide.category}</span><i aria-hidden="true">▶</i><small>{guide.duration} ثانية</small></div><div className="tutorials-card-copy"><h3>{guide.title}</h3><p>{guide.description}</p><span>{active.id === guide.id ? "الشرح المحدد" : "شاهد الشرح"} <span aria-hidden="true">←</span></span></div></button>)}</div>
      {filtered.length === 0 ? <div className="tutorials-empty"><h3>ما لقينا شرحًا بهذا البحث</h3><p>جرّب كلمة ثانية أو اعرض كل الشروحات.</p><button type="button" onClick={() => { setQuery(""); setCategory("الكل"); }}>عرض الكل</button></div> : null}
    </section>
    <footer className="tutorials-footer"><div><h2>تحتاج مساعدة في خطوة؟</h2><p>فريق الدعم يساعدك تكمل إعداد حسابك.</p></div><Link href="/dashboard/support" className="tutorials-primary">تواصل مع الدعم ←</Link></footer>
  </main>;
}
