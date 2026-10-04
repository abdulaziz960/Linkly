"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import logo from "../../public/assets/linkly-logo.png";
import c from "./landing.module.css";
import { ChannelGlyph, HUB_CHANNELS, channelColor, type Lang } from "./channelData";
import { useReducedMotion } from "./motion";

const copy = {
  ar: {
    company: "اسم النشاط",
    email: "البريد الإلكتروني",
    created: "تم إنشاء الحساب",
    connected: "6 قنوات متصلة",
    team: [["س", "سارة"], ["ف", "فهد"], ["ر", "ريان"]],
    chats: ["واتساب", "إنستغرام", "البريد"],
    customer: "وليد السبيعي",
    states: ["جديدة", "تم الرد", "تم الحل ✓"]
  },
  en: {
    company: "Business name",
    email: "Email",
    created: "Account created",
    connected: "6 channels connected",
    team: [["S", "Sara"], ["F", "Fahad"], ["R", "Rayan"]],
    chats: ["WhatsApp", "Instagram", "Email"],
    customer: "Waleed Alsubaie",
    states: ["New", "Replied", "Resolved ✓"]
  }
};

function StepVisual({ index, lang }: { index: number; lang: Lang }) {
  const t = copy[lang];
  if (index === 0) {
    return (
      <div className={c.vAccount}>
        <span><small>{t.company}</small><i /></span>
        <span><small>{t.email}</small><i /></span>
        <b>✓ {t.created}</b>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className={c.vChannels}>
        {HUB_CHANNELS.map((channel, i) => (
          <span key={channel} style={{ "--c": channelColor[channel], "--i": i } as CSSProperties}><ChannelGlyph channel={channel} /></span>
        ))}
        <div className={c.vBox}><Image src={logo} alt="" width={44} height={24} /></div>
        <b>{t.connected}</b>
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className={c.vTeam}>
        {t.chats.map((chat, i) => <span key={chat} className={c.vChat} style={{ "--i": i } as CSSProperties}>{chat}</span>)}
        <div>
          {t.team.map(([initial, name]) => <em key={name} title={name}>{initial}</em>)}
        </div>
      </div>
    );
  }
  return (
    <div className={c.vReply}>
      <em>{t.customer.slice(0, 1)}</em>
      <b>{t.customer}</b>
      <span className={c.vStates}>
        {t.states.map((state, i) => <span key={state} style={{ "--i": i } as CSSProperties}>{state}</span>)}
      </span>
    </div>
  );
}

export default function HowJourney({ lang, steps }: { lang: Lang; steps: readonly (readonly [string, string, string])[] }) {
  const listRef = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();
  const [reached, setReached] = useState(-1);

  // While the list is on screen, a passive scroll handler fills the line up to
  // the viewport middle and activates every step whose marker has crossed it.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (reduced) {
      list.style.setProperty("--progress", "1");
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const middle = window.innerHeight / 2;
      const box = list.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (middle - box.top) / box.height));
      list.style.setProperty("--progress", progress.toFixed(3));
      const markers = Array.from(list.querySelectorAll<HTMLElement>("[data-marker]"));
      let last = -1;
      markers.forEach((marker, i) => {
        if (marker.getBoundingClientRect().top < middle) last = i;
      });
      setReached((current) => (current === last ? current : last));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        onScroll();
      } else {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      }
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced]);

  const activeIndex = reduced ? steps.length - 1 : reached;

  return (
    <ol className={c.journey} ref={listRef}>
      {steps.map(([number, title, text], index) => (
        <li key={number} className={c.journeyStep} data-active={index <= activeIndex || undefined} data-current={index === activeIndex || undefined}>
          <span className={c.journeyMarker} data-marker>{number}</span>
          <div className={c.journeyText}>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
          <div className={c.journeyVisual} aria-hidden="true">
            <StepVisual index={index} lang={lang} />
          </div>
        </li>
      ))}
    </ol>
  );
}
