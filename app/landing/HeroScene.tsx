"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import logo from "../../public/assets/linkly-logo.png";
import c from "./landing.module.css";
import { ChannelGlyph, HUB_CHANNELS, channelColor, channelLabel, sampleMessages, type HubChannel, type Lang } from "./channelData";
import { useInView, usePageVisible, useReducedMotion, useTimers } from "./motion";

// Scene coordinates live in one 640x520 box shared by the SVG paths and the
// absolutely positioned HTML nodes, so lines always meet their icons.
const W = 640;
const H = 520;
const NODES: Record<HubChannel, { x: number; y: number; tx: number; ty: number }> = {
  whatsapp: { x: 78, y: 118, tx: 170, ty: 182 },
  facebook: { x: 60, y: 268, tx: 170, ty: 262 },
  email: { x: 90, y: 420, tx: 170, ty: 346 },
  instagram: { x: 562, y: 118, tx: 470, ty: 182 },
  telegram: { x: 580, y: 268, tx: 470, ty: 262 },
  tiktok: { x: 550, y: 420, tx: 470, ty: 346 }
};
const ORDER: HubChannel[] = ["whatsapp", "instagram", "telegram", "facebook", "tiktok", "email"];
const TRAVEL_MS = 1100;
const CYCLE_MS = 2900;

function curve(channel: HubChannel) {
  const n = NODES[channel];
  const mid = (n.x + n.tx) / 2;
  return `M${n.x} ${n.y} C${mid} ${n.y} ${mid} ${n.ty} ${n.tx} ${n.ty}`;
}

const copy = {
  ar: { label: "مشهد توضيحي: رسائل من القنوات المختلفة تصل إلى صندوق Linkly واحد", title: "صندوق Linkly", now: "الآن", fresh: "جديدة", send: (name: string) => `أرسل رسالة تجريبية من ${name}`, routed: "توزيع تلقائي على الفريق", count: (n: number) => `${n} جديدة` },
  en: { label: "Illustration: messages from different channels arriving in one Linkly inbox", title: "Linkly Inbox", now: "now", fresh: "New", send: (name: string) => `Send a demo message from ${name}`, routed: "Auto-routed to your team", count: (n: number) => `${n} new` }
};

type Row = { id: number; channel: HubChannel; fresh: boolean };
const INITIAL_ROWS: Row[] = [
  { id: 3, channel: "email", fresh: false },
  { id: 2, channel: "instagram", fresh: false },
  { id: 1, channel: "whatsapp", fresh: false }
];

export default function HeroScene({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [sceneRef, inView] = useInView<HTMLElement>("0px", 0.1);
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const timers = useTimers();
  const [rows, setRows] = useState<Row[]>(INITIAL_ROWS);
  const [pulse, setPulse] = useState<{ channel: HubChannel; id: number } | null>(null);
  const [hovered, setHovered] = useState<HubChannel | null>(null);
  const [arrivals, setArrivals] = useState(12);
  const nextId = useRef(10);
  const orderIndex = useRef(0);

  const send = useCallback((channel: HubChannel) => {
    const id = ++nextId.current;
    setPulse({ channel, id });
    timers.later(() => {
      setRows((current) => [{ id, channel, fresh: true }, ...current.filter((row) => row.channel !== channel).map((row) => ({ ...row, fresh: false }))].slice(0, 5));
      setArrivals((n) => n + 1);
    }, reduced ? 0 : TRAVEL_MS);
  }, [reduced, timers]);

  useEffect(() => {
    if (!inView || reduced || !pageVisible) return;
    const interval = window.setInterval(() => {
      send(ORDER[orderIndex.current++ % ORDER.length]);
    }, CYCLE_MS);
    return () => window.clearInterval(interval);
  }, [inView, reduced, pageVisible, send]);

  // Mouse parallax: written straight to CSS variables (no React re-render),
  // mouse only, and skipped on low-end devices and with reduced motion.
  useEffect(() => {
    const root = sceneRef.current;
    if (!root || reduced) return;
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4) {
      root.dataset.lite = "true";
      return;
    }
    const host = root.parentElement ?? root;
    let frame = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      frame = 0;
      root.style.setProperty("--px", px.toFixed(3));
      root.style.setProperty("--py", py.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = root.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, (event.clientX - (box.left + box.width / 2)) / (box.width / 2)));
      py = Math.max(-1, Math.min(1, (event.clientY - (box.top + box.height / 2)) / (box.height / 2)));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      px = 0;
      py = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced, sceneRef]);

  const highlighted = hovered ?? pulse?.channel ?? null;

  return (
    <figure ref={sceneRef} className={c.scene} aria-label={t.label} data-dir={lang === "ar" ? "rtl" : "ltr"}>
      <span className={c.sceneGlow} aria-hidden="true" />
      <div className={c.stage}>
        <svg className={c.links} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="none">
          {HUB_CHANNELS.map((channel) => (
            <path key={channel} d={curve(channel)} className={c.link} data-active={highlighted === channel || undefined} style={{ "--link": channelColor[channel] } as CSSProperties} />
          ))}
          {pulse && !reduced ? (
            <path key={pulse.id} d={curve(pulse.channel)} pathLength={100} className={c.pulse} style={{ color: channelColor[pulse.channel] }} />
          ) : null}
        </svg>

        <div className={c.panel} style={{ "--l": `${(170 / W) * 100}%`, "--t": `${(96 / H) * 100}%`, "--w": `${(300 / W) * 100}%`, "--h": `${(328 / H) * 100}%` } as CSSProperties}>
          <header className={c.panelHead}>
            <Image src={logo} alt="" width={34} height={19} />
            <b>{t.title}</b>
            <span className={c.panelCount}>{t.count(arrivals)}</span>
          </header>
          <ul className={c.rows} aria-hidden="true">
            {rows.map((row, index) => {
              const sample = sampleMessages[lang][row.channel];
              return (
                <li key={row.id} className={c.row} data-fresh={row.fresh || undefined} style={{ transform: `translateY(${index * 100}%)` }}>
                  <em style={{ color: channelColor[row.channel] }}><ChannelGlyph channel={row.channel} /></em>
                  <div>
                    <b>{sample.customer}</b>
                    <p>{sample.text}</p>
                  </div>
                  <small>{row.fresh ? <span className={c.freshTag}>{t.fresh}</span> : t.now}</small>
                </li>
              );
            })}
          </ul>
          <footer className={c.panelFoot}><span className={c.liveDot} aria-hidden="true" />{t.routed}</footer>
        </div>

        {HUB_CHANNELS.map((channel) => {
          const node = NODES[channel];
          const name = channelLabel(channel, lang);
          return (
            <button
              key={channel}
              type="button"
              className={c.node}
              data-active={highlighted === channel || undefined}
              data-sending={pulse?.channel === channel || undefined}
              style={{ "--x": `${(node.x / W) * 100}%`, "--y": `${(node.y / H) * 100}%`, "--c": channelColor[channel], "--d": `${ORDER.indexOf(channel) * -0.9}s` } as CSSProperties}
              aria-label={t.send(name)}
              onPointerEnter={() => setHovered(channel)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(channel)}
              onBlur={() => setHovered(null)}
              onClick={() => send(channel)}
            >
              <span className={c.nodeInner}><ChannelGlyph channel={channel} /></span>
              <span className={c.nodeLabel} aria-hidden="true">{name}</span>
            </button>
          );
        })}
      </div>
    </figure>
  );
}
