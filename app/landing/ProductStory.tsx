"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import c from "./landing.module.css";
import { ChannelGlyph, channelColor, channelLabel, type HubChannel, type Lang } from "./channelData";
import { useInView, usePageVisible, useReducedMotion, useTimers } from "./motion";

type Status = "new" | "open" | "resolved";
type ConvState = { status: Status; assignee: string | null; phase: number; unread: boolean };
type Script = { channel: HubChannel; customer: string; initial: string; text: string; reply: string; tag: string; assignee: string };

// Illustrative demo conversations - fictional names and messages.
const SCRIPTS: Record<Lang, Script[]> = {
  ar: [
    { channel: "whatsapp", customer: "وليد السبيعي", initial: "و", text: "السلام عليكم، هل المنتج متوفر اليوم؟", reply: "وعليكم السلام، نعم متوفر. أرسل لك رابط الطلب الآن.", tag: "عميل مهتم", assignee: "sara" },
    { channel: "instagram", customer: "نورة أحمد", initial: "ن", text: "وصلتني رسالتكم من الإعلان، وش العرض؟", reply: "أهلًا نورة! العرض خصم 20% حتى نهاية الأسبوع.", tag: "حملة إعلانية", assignee: "rayan" },
    { channel: "email", customer: "شركة سمارت", initial: "س", text: "نحتاج عرض سعر لفريق من 12 موظف.", reply: "أرسلنا العرض على بريدكم، ونتواصل معكم اليوم.", tag: "فرصة بيع", assignee: "sara" },
    { channel: "telegram", customer: "محمد علي", initial: "م", text: "أحتاج مساعدة في الطلب رقم 2041.", reply: "تم تحديث طلبك، ويوصلك خلال يومين.", tag: "دعم", assignee: "fahad" }
  ],
  en: [
    { channel: "whatsapp", customer: "Waleed Alsubaie", initial: "W", text: "Hello, is the product available today?", reply: "Hello, yes it is. Sending you the order link now.", tag: "Interested", assignee: "sara" },
    { channel: "instagram", customer: "Noura Ahmed", initial: "N", text: "I got your message from the ad. What is the offer?", reply: "Hi Noura! It is 20% off until the end of the week.", tag: "Ad campaign", assignee: "rayan" },
    { channel: "email", customer: "Smart Co.", initial: "S", text: "We need a quote for a 12-person team.", reply: "We emailed you the quote and will call you today.", tag: "Sales lead", assignee: "sara" },
    { channel: "telegram", customer: "Mohammed Ali", initial: "M", text: "I need help with order #2041.", reply: "Your order is updated and arrives within two days.", tag: "Support", assignee: "fahad" }
  ]
};

const EMPLOYEES: Record<Lang, { id: string; name: string; team: string }[]> = {
  ar: [
    { id: "sara", name: "سارة", team: "فريق المبيعات" },
    { id: "fahad", name: "فهد", team: "الدعم الفني" },
    { id: "rayan", name: "ريان", team: "خدمة العملاء" }
  ],
  en: [
    { id: "sara", name: "Sara", team: "Sales team" },
    { id: "fahad", name: "Fahad", team: "Support" },
    { id: "rayan", name: "Rayan", team: "Customer care" }
  ]
};

const copy = {
  ar: {
    label: "نموذج تفاعلي لصندوق محادثات Linkly",
    list: "المحادثات",
    status: { new: "جديدة", open: "قيد المتابعة", resolved: "تم الحل" } as Record<Status, string>,
    assign: "إسناد",
    unassigned: "غير مسندة",
    assigned: (name: string, team: string) => `أُسندت المحادثة إلى ${name} · ${team}`,
    resolve: "حل المحادثة",
    play: "تشغيل العرض",
    paused: "العرض متوقف، جرّب بنفسك",
    typing: "يكتب",
    composer: "اكتب ردك هنا…",
    fresh: "رسالة جديدة",
    now: "الآن"
  },
  en: {
    label: "Interactive model of the Linkly inbox",
    list: "Conversations",
    status: { new: "New", open: "In progress", resolved: "Resolved" } as Record<Status, string>,
    assign: "Assign",
    unassigned: "Unassigned",
    assigned: (name: string, team: string) => `Assigned to ${name} · ${team}`,
    resolve: "Resolve",
    play: "Play demo",
    paused: "Demo paused. Try it yourself",
    typing: "typing",
    composer: "Type your reply here…",
    fresh: "New message",
    now: "now"
  }
};

const initialStates = (): ConvState[] => SCRIPTS.ar.map((_, index) => ({ status: "new", assignee: null, phase: 0, unread: index === 1 }));

function LiveInbox({ lang, focus, inView }: { lang: Lang; focus: number; inView: boolean }) {
  const t = copy[lang];
  const scripts = SCRIPTS[lang];
  const employees = EMPLOYEES[lang];
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const timers = useTimers();
  const [active, setActive] = useState(0);
  const [states, setStates] = useState<ConvState[]>(initialStates);
  const [playing, setPlaying] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const patch = (index: number, next: Partial<ConvState>) =>
    setStates((current) => current.map((state, i) => (i === index ? { ...state, ...next } : state)));

  useEffect(() => {
    if (!playing || !inView || reduced || !pageVisible) return;
    const script = scripts[active];
    const next = (active + 1) % scripts.length;
    timers.later(() => patch(active, { assignee: script.assignee, status: "open", phase: 1 }), 1300);
    timers.later(() => patch(active, { phase: 2 }), 2500);
    timers.later(() => patch(active, { phase: 3 }), 4000);
    timers.later(() => patch(next, { unread: true }), 4600);
    timers.later(() => patch(active, { phase: 4, status: "resolved" }), 5400);
    timers.later(() => {
      setStates((current) => current.map((state, i) => (i === next ? { status: "new", assignee: null, phase: 0, unread: false } : state)));
      setActive(next);
    }, 7600);
    return () => timers.clear();
  }, [active, playing, inView, reduced, pageVisible, scripts, timers]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const takeOver = () => {
    timers.clear();
    setPlaying(false);
  };

  const script = scripts[active];
  const state = states[active];
  // With reduced motion the demo never plays, so show the finished story.
  const phase = reduced && playing ? 4 : state.phase;
  const status: Status = reduced && playing ? "resolved" : state.status;
  const assigneeId = reduced && playing ? script.assignee : state.assignee;
  const assignee = employees.find((employee) => employee.id === assigneeId) ?? null;

  return (
    <div className={c.inbox} data-focus={focus} aria-label={t.label} role="group">
      <aside className={c.inboxList}>
        <div className={c.inboxListHead}>
          <b>{t.list}</b>
          {playing ? <span className={c.liveDot} aria-hidden="true" /> : null}
        </div>
        {scripts.map((item, index) => (
          <button
            key={item.customer}
            type="button"
            className={c.inboxRow}
            aria-pressed={index === active}
            onClick={() => {
              takeOver();
              setActive(index);
              patch(index, { unread: false });
            }}
          >
            <em style={{ "--c": channelColor[item.channel] } as CSSProperties}>{item.initial}<i><ChannelGlyph channel={item.channel} /></i></em>
            <span>
              <b>{item.customer}</b>
              <small>{item.text}</small>
            </span>
            {states[index].unread && index !== active ? <span className={c.unread} aria-label={t.fresh}>1</span> : null}
            <span className={c.rowStatus} data-status={index === active ? status : states[index].status} aria-hidden="true" />
          </button>
        ))}
      </aside>

      <section className={c.thread}>
        <header className={c.threadHead}>
          <div>
            <b>{script.customer}</b>
            <small>{channelLabel(script.channel, lang)} · {t.now}</small>
          </div>
          <span className={c.statusChip} data-status={status} data-ring={focus === 2 || undefined}>
            <span key={status}>{t.status[status]}</span>
          </span>
          <div className={c.assignWrap} ref={menuRef} data-ring={focus === 1 || undefined}>
            <button
              type="button"
              className={c.assignButton}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                takeOver();
                setMenuOpen((open) => !open);
              }}
            >
              <span className={c.avatarDot} aria-hidden="true">{assignee ? assignee.name.slice(0, 1) : "+"}</span>
              {assignee ? assignee.name : t.assign}
            </button>
            {menuOpen ? (
              <ul className={c.assignMenu} role="menu">
                {employees.map((employee) => (
                  <li key={employee.id} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        patch(active, { assignee: employee.id, status: status === "resolved" ? "resolved" : "open", phase: Math.max(phase, 1) });
                        setMenuOpen(false);
                      }}
                    >
                      <span className={c.avatarDot} aria-hidden="true">{employee.name.slice(0, 1)}</span>
                      <span><b>{employee.name}</b><small>{employee.team}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </header>

        <div className={c.threadBody} data-ring={focus === 0 || undefined}>
          <p key={`in-${active}`} className={`${c.bubble} ${c.bubbleIn}`}>{script.text}</p>
          <p className={c.systemLine} data-show={Boolean(assignee) || undefined}>
            {assignee ? t.assigned(assignee.name, assignee.team) : t.unassigned}
          </p>
          <div className={c.replySlot}>
            <span className={c.typing} data-show={phase === 2 || undefined} aria-hidden="true"><i /><i /><i /> {t.typing}</span>
            <p className={`${c.bubble} ${c.bubbleOut}`} data-show={phase >= 3 || undefined}>{script.reply}</p>
          </div>
          <div className={c.resolvedRow} data-show={status === "resolved" || undefined}>
            <span className={c.tagChip}>{script.tag}</span>
            <span className={c.doneChip}>✓ {t.status.resolved}</span>
          </div>
        </div>

        <footer className={c.threadFoot}>
          {playing ? (
            <span className={c.composerText}>{t.composer}</span>
          ) : (
            <button type="button" className={c.playButton} onClick={() => setPlaying(true)}>▶ {t.play}</button>
          )}
          {!playing ? <small className={c.pausedNote}>{t.paused}</small> : null}
          <button
            type="button"
            className={c.resolveButton}
            disabled={status === "resolved"}
            onClick={() => {
              takeOver();
              patch(active, { status: "resolved", phase: Math.max(phase, 1), assignee: assigneeId ?? script.assignee });
            }}
          >
            {t.resolve}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function ProductStory({ lang, steps }: { lang: Lang; steps: readonly (readonly [string, string, string])[] }) {
  const [focus, setFocus] = useState(0);
  const [storyRef, inView] = useInView<HTMLDivElement>("0px", 0.15);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  // Each feature becomes active as it crosses the middle of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = stepRefs.current.indexOf(entry.target as HTMLElement);
        if (index >= 0) setFocus(index);
      }
    }, { rootMargin: "-45% 0px -45% 0px" });
    stepRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={c.story} ref={storyRef}>
      <ol className={c.storySteps}>
        {steps.map(([number, title, text], index) => (
          <li key={number} ref={(element) => { stepRefs.current[index] = element; }} data-active={focus === index || undefined} onClick={() => setFocus(index)}>
            <span className={c.storyNumber}>{number}</span>
            <div>
              <h3><button type="button" aria-pressed={focus === index} onClick={() => setFocus(index)}>{title}</button></h3>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className={c.storyStage}>
        <LiveInbox lang={lang} focus={focus} inView={inView} />
      </div>
    </div>
  );
}
