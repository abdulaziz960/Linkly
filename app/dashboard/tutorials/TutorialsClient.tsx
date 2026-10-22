"use client";

import Link from "next/link";
import InboxBackLink from "../components/InboxBackLink";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import guidesAr from "./guides.json";
import guidesEn from "./guides.en.json";
import { useStoredLanguage } from "../../useStoredLanguage";

type Guide = (typeof guidesAr)[number];
const ALL = "__all__";
const copy = {
  ar: {
    brandLabel: "لنكلي — مركز الشروحات", logoAlt: "شعار لنكلي", section: "مركز الشروحات", navLabel: "التنقل",
    phrases: ["تعلّم", "طبّق", "انطلق"], title1: "كل ميزة،", title2: "بخطوات واضحة.",
    lead: "من أول ربط للواتساب إلى أتمتة متابعة عملائك. شروحات قصيرة تساعدك تعرف وين تروح وكيف تبدأ.",
    explore: "استكشف الشروحات", artLabel: "مكتبة التعلّم", artTitle: "تعلّم على لنكلي.", artDesc: "من أول ربط، إلى آخر خطوة.", topics: ["القنوات", "الرد الآلي"],
    ready: "شرحًا جاهزًا", silent: "أسهم توضيحية بدون صوت", atYourPace: "تعلّم حسب وقتك",
    closeGuide: "إغلاق الشرح", beforeConnecting: "قبل الربط:", storeNote: "ربط المتجر مستقل عن ربط واتساب. إذا ظهرت رسالة «بيانات التطبيق غير مضبوطة» يلزم إعداد تطبيق المتجر على الخادم أولًا. هذا المقطع يشرح مواضع الإعدادات؛ إتمام الربط يحتاج متجرًا مفوضًا.",
    speed: "سرعة الشرح", slow: "بطيء 0.75×", normal: "عادي 1×", fast: "سريع 1.25×", fullscreen: "تكبير الفيديو ⛶",
    fullscreenFail: "استخدم زر ملء الشاشة داخل مشغل الفيديو، أو افتح المقطع مباشرة.", videoLabel: (title: string) => `شرح ${title}`,
    noVideo: "متصفحك لا يدعم تشغيل الفيديو. يمكنك قراءة الخطوات أدناه.", openVideo: "افتح الفيديو", videoFailed: "تعذر تشغيل المقطع.", openVideoDirect: "افتح الفيديو مباشرة", orSteps: "أو تابع الخطوات المكتوبة.",
    videoNote: "شاشة كاملة وشرح بالأسهم بدون صوت، يبدأ من القائمة الجانبية. أوقف المقطع أو كبّره لتطبيق الخطوة.",
    seconds: "ثانية", steps: "خطوات التطبيق", stepsCount: (n: number) => `${n} خطوات`, goStep: (n: number, title: string) => `انتقل إلى الخطوة ${n}: ${title}`,
    openSetup: "افتح صفحة الإعداد", permissionsNote: "فتح الإعدادات وتنفيذها يخضع لصلاحيات حسابك وباقتك.",
    library: "مكتبة الشروحات", whatToLearn: "وش تبي تتعلّم اليوم؟", search: "ابحث عن ميزة أو تكامل", searchPlaceholder: "ابحث: واتساب، سلة، الرد الآلي…",
    browse: "تصفّح حسب الموضوع", allGuides: "جميع الشروحات", count: (n: number) => `${n} شرح`, selected: "الشرح المحدد", watch: "شاهد الشرح",
    emptyTitle: "ما لقينا شرحًا بهذا البحث", emptyText: "جرّب كلمة ثانية أو اعرض كل الشروحات.", showAll: "عرض الكل",
    helpTitle: "تحتاج مساعدة في خطوة؟", helpText: "فريق الدعم يساعدك تكمل إعداد حسابك.", contactSupport: "تواصل مع الدعم ←", back: "ar"
  },
  en: {
    brandLabel: "Linkly — Tutorials center", logoAlt: "Linkly logo", section: "Tutorials center", navLabel: "Navigation",
    phrases: ["Learn", "Apply", "Go live"], title1: "Every feature,", title2: "in clear steps.",
    lead: "From your first WhatsApp connection to automating customer follow-up. Short guides that show you where to go and how to start.",
    explore: "Explore the guides", artLabel: "Learning library", artTitle: "Learn Linkly.", artDesc: "From the first connection to the last step.", topics: ["Channels", "Auto-reply"],
    ready: "ready-made guides", silent: "Arrow-guided, no sound", atYourPace: "Learn at your own pace",
    closeGuide: "Close the guide", beforeConnecting: "Before connecting:", storeNote: "Connecting the store is separate from connecting WhatsApp. If you see “app details are not configured”, the store app must be set up on the server first. This clip shows where the settings are; completing the connection needs an authorized store.",
    speed: "Playback speed", slow: "Slow 0.75×", normal: "Normal 1×", fast: "Fast 1.25×", fullscreen: "Enlarge video ⛶",
    fullscreenFail: "Use the full-screen button inside the video player, or open the clip directly.", videoLabel: (title: string) => `Guide: ${title}`,
    noVideo: "Your browser doesn't support video playback. You can read the steps below.", openVideo: "Open the video", videoFailed: "The clip couldn't be played.", openVideoDirect: "Open the video directly", orSteps: "or follow the written steps.",
    videoNote: "Full-screen, arrow-guided and silent, starting from the sidebar. Pause or enlarge the clip to apply each step.",
    seconds: "s", steps: "Steps to apply", stepsCount: (n: number) => `${n} steps`, goStep: (n: number, title: string) => `Go to step ${n}: ${title}`,
    openSetup: "Open the setup page", permissionsNote: "Opening and running the settings depends on your account's permissions and plan.",
    library: "Tutorials library", whatToLearn: "What do you want to learn today?", search: "Search for a feature or integration", searchPlaceholder: "Search: WhatsApp, Salla, auto-reply…",
    browse: "Browse by topic", allGuides: "All guides", count: (n: number) => `${n} guides`, selected: "Selected guide", watch: "Watch the guide",
    emptyTitle: "No guides match this search", emptyText: "Try another word or show all the guides.", showAll: "Show all",
    helpTitle: "Need help with a step?", helpText: "The support team helps you finish setting up your account.", contactSupport: "Contact support →", back: "en"
  }
} as const;

const normalize = (value: string) => value.normalize("NFKD").replace(/[\u064B-\u065F\u0670ـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLowerCase();

export default function TutorialsClient({ allowedViews }: { allowedViews?: string[] }) {
  const [lang] = useStoredLanguage("ar");
  const text = copy[lang];
  useEffect(() => {
    document.title = lang === "en" ? "Tutorials center | Linkly" : "مركز الشروحات | Linkly";
  }, [lang]);
  const en = lang === "en";
  // Employees only see the guides for sections they can open; the owner (and anyone with every view) sees all of them.
  const visible = (guide: { id: string }) => {
    if (!allowedViews) return true;
    const view = guidesAr.find((item) => item.id === guide.id)?.view;
    return !view || allowedViews.includes(view);
  };
  const guidesAll = guidesAr.filter(visible) as typeof guidesAr;
  const guides = ((en ? guidesEn : guidesAr) as unknown as typeof guidesAr).filter(visible);
  const categories = [ALL, ...new Set(guidesAll.map((guide) => guide.category))];
  // The category as shown in the UI language (the Arabic one is the filter key).
  const categoryLabel = (guideId: string) => guides.find((guide) => guide.id === guideId)?.category ?? "";
  const keyOf = (guideId: string) => guidesAll.find((guide) => guide.id === guideId)?.category ?? "";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [activeId, setActiveId] = useState(guidesAll[0]?.id ?? "");
  const [videoError, setVideoError] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [playerNotice, setPlayerNotice] = useState("");
  const player = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const active = guides.find((guide) => guide.id === activeId) ?? guides[0];
  // An English recording carries its own duration and step times; until one exists the Arabic recording (with English captions) is used.
  const hasEnglishVideo = (guide: { duration?: number }) => en && Boolean(guide.duration);
  const recorded = hasEnglishVideo(active as { duration?: number });
  const meta = (recorded ? active : guidesAr.find((guide) => guide.id === active.id) ?? guidesAr[0]) as typeof guidesAr[number];
  const videoSuffix = recorded ? ".en" : "";
  const codeExample = "code" in active ? active.code : undefined;
  const filtered = guides.filter((guide) => (category === ALL || keyOf(guide.id) === category) && normalize(`${guide.title} ${guide.description} ${guide.category} ${guide.steps.map((step) => step.body).join(" ")}`).includes(normalize(query.trim())));
  const captionsSrc = en ? "en" : "ar";

  function selectGuide(guide: Guide) {
    setActiveId(guide.id);
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
      player.current.currentTime = meta.steps[index].start;
      setCurrentStep(index);
    }
  }

  return <main className="tutorials-page" dir={en ? "ltr" : "rtl"} lang={lang}>
    <header className="tutorials-header"><Link href="/dashboard?view=inbox" className="tutorials-brand" aria-label={text.brandLabel}><Image src="/assets/linkly-logo.png" alt={text.logoAlt} width={64} height={36} priority /><span className="tutorials-wordmark" dir="ltr">Linkly</span><span className="tutorials-brand-section">{text.section}</span></Link><nav aria-label={text.navLabel}><InboxBackLink language={lang} /></nav></header>
    <section className="tutorials-hero">
      <div><span className="tutorials-eyebrow tutorials-phrase-list">{text.phrases.map((phrase) => <span key={phrase}>{phrase}</span>)}</span><h1>{text.title1}<br /><em>{text.title2}</em></h1><p>{text.lead}</p><a href="#tutorial-library" className="tutorials-primary">{text.explore} <span aria-hidden="true">↓</span></a></div>
      <div className="tutorials-hero-art" aria-hidden="true"><span className="tutorials-art-label">{text.artLabel}</span><div className="tutorials-art-brand"><Image src="/assets/linkly-logo.png" alt="" width={90} height={50} /><b dir="ltr">Linkly</b></div><strong>{text.artTitle}</strong><span className="tutorials-art-description">{text.artDesc}</span><div className="tutorials-art-topics">{text.topics.map((topic) => <span key={topic}>{topic}</span>)}<span dir="ltr">API</span></div><div className="tutorials-mini-progress"><i /><i /><i /><i /></div></div>
    </section>
    <div className="tutorials-summary"><span><strong>{guides.length}</strong> {text.ready}</span><span>{text.silent}</span><span>{text.atYourPace}</span></div>
    <dialog className="tutorials-dialog" ref={dialog} aria-labelledby="tutorial-title" onClose={() => player.current?.pause()} onCancel={() => player.current?.pause()} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeGuide(); } }}><header className="tutorials-dialog-header"><h2 id="tutorial-title">{active.title}</h2><button type="button" onClick={closeGuide} aria-label={text.closeGuide}>✕</button></header><section className="tutorials-detail">
      {["salla", "zid", "shopify"].includes(active.id) ? <p className="tutorials-prerequisite" role="note"><strong>{text.beforeConnecting}</strong> {text.storeNote}</p> : null}
      <div className="tutorials-video-wrap">
        <div className="tutorials-player-toolbar"><label className="tutorials-speed">{text.speed}<select defaultValue="1" key={active.id} onChange={(event) => { if (player.current) player.current.playbackRate = Number(event.target.value); }}><option value="0.75">{text.slow}</option><option value="1">{text.normal}</option><option value="1.25">{text.fast}</option></select></label><button type="button" onClick={() => { const video = player.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null; if (video?.requestFullscreen) void video.requestFullscreen().catch(() => setPlayerNotice(text.fullscreenFail)); else video?.webkitEnterFullscreen?.(); }}>{text.fullscreen}</button></div>
        <video key={`${active.id}-${lang}`} ref={player} controls muted playsInline preload="none" poster={`/tutorials/${active.id}${videoSuffix}.jpg?v=fullscreen4`} aria-label={text.videoLabel(active.title)} onError={() => setVideoError(true)} onTimeUpdate={() => setCurrentStep(Math.max(0, meta.steps.findLastIndex((step) => step.start <= (player.current?.currentTime ?? 0))))}>
          <source src={`/tutorials/${active.id}${videoSuffix}.mp4?v=fullscreen4`} type="video/mp4" />
          <track kind="captions" src={`/tutorials/${active.id}${en ? ".en" : ""}.vtt?v=fullscreen4`} srcLang={captionsSrc} label={en ? "English" : "العربية"} default={en} />
          {text.noVideo}
        </video>
        {playerNotice ? <p role="status">{playerNotice} <a href={`/tutorials/${active.id}${videoSuffix}.mp4`}>{text.openVideo}</a></p> : null}
        {videoError ? <p role="alert">{text.videoFailed} <a href={`/tutorials/${active.id}${videoSuffix}.mp4`}>{text.openVideoDirect}</a> {text.orSteps}</p> : null}
        <p className="tutorials-video-note">{text.videoNote}{en && !recorded ? " This clip shows the Arabic interface; the captions and steps are in English." : ""}</p>
      </div>
      <div className="tutorials-instructions"><span className="tutorials-eyebrow tutorials-phrase-list"><span>{active.category}</span><span>{meta.duration} {text.seconds}</span></span><p>{active.description}</p><details key={active.id} className="tutorials-step-details"><summary>{text.steps} <span>{text.stepsCount(active.steps.length)}</span></summary><ol>{active.steps.map((step, index) => <li key={step.title} className={index === currentStep ? "is-current" : ""}><button type="button" onClick={() => seek(index)} aria-label={text.goStep(index + 1, step.title)} aria-current={index === currentStep ? "step" : undefined}><span>{index + 1}</span><b>{step.title}</b></button><p>{step.body}</p></li>)}</ol></details>{codeExample ? <pre className="tutorials-code" dir="ltr"><code>{codeExample}</code></pre> : null}<Link className="tutorials-primary" href={`/dashboard?view=${meta.view}`}>{text.openSetup} <span aria-hidden="true">{en ? "→" : "←"}</span></Link><small>{text.permissionsNote}</small></div>
    </section></dialog>
    <section id="tutorial-library" className="tutorials-library" aria-labelledby="library-title"><div className="tutorials-library-heading"><div><span className="tutorials-eyebrow">{text.library}</span><h2 id="library-title">{text.whatToLearn}</h2></div><label className="tutorials-search"><span>{text.search}</span><input type="search" placeholder={text.searchPlaceholder} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      <label className="tutorials-category-filter"><span>{text.browse}</span><span className="tutorials-category-select"><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item === ALL ? text.allGuides : categoryLabel(guidesAll.find((guide) => guide.category === item)?.id ?? "")}</option>)}</select><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span></label>
      <p className="tutorials-result-count" role="status">{text.count(filtered.length)}</p>
      <div className="tutorials-grid">{filtered.map((guide, index) => <button type="button" key={guide.id} className={`tutorials-card ${active.id === guide.id ? "is-selected" : ""}`} aria-haspopup="dialog" aria-pressed={active.id === guide.id} onClick={() => selectGuide(guide)}><div className={`tutorials-card-art tone-${index % 3}`}><Image src={`/tutorials/${guide.id}${hasEnglishVideo(guide as { duration?: number }) ? ".en" : ""}.jpg?v=fullscreen4`} alt="" fill sizes="(max-width: 560px) 100vw, (max-width: 850px) 50vw, 33vw" unoptimized /><span>{guide.category}</span><i aria-hidden="true">▶</i><small>{(hasEnglishVideo(guide as { duration?: number }) ? (guide as { duration?: number }).duration : guidesAr.find((item) => item.id === guide.id)?.duration)} {text.seconds}</small></div><div className="tutorials-card-copy"><h3>{guide.title}</h3><p>{guide.description}</p><span>{active.id === guide.id ? text.selected : text.watch} <span aria-hidden="true">{en ? "→" : "←"}</span></span></div></button>)}</div>
      {filtered.length === 0 ? <div className="tutorials-empty"><h3>{text.emptyTitle}</h3><p>{text.emptyText}</p><button type="button" onClick={() => { setQuery(""); setCategory(ALL); }}>{text.showAll}</button></div> : null}
    </section>
    <footer className="tutorials-footer"><div><h2>{text.helpTitle}</h2><p>{text.helpText}</p></div><Link href="/dashboard/support" className="tutorials-primary">{text.contactSupport}</Link></footer>
  </main>;
}
