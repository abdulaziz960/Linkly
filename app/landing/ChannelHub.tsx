"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import logo from "../../public/assets/linkly-logo.png";
import c from "./landing.module.css";
import { ChannelGlyph, HUB_CHANNELS, channelColor, channelLabel, sampleMessages, type HubChannel, type Lang } from "./channelData";
import { useInView, usePageVisible, useReducedMotion, useTimers } from "./motion";

const SIZE = 520;
const CENTER = SIZE / 2;
const RADIUS = 196;
const ANGLES: Record<HubChannel, number> = { whatsapp: -90, instagram: -30, facebook: 30, telegram: 90, email: 150, tiktok: 210 };

function geometry(channel: HubChannel) {
  const rad = (ANGLES[channel] * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const x = CENTER + RADIUS * dx;
  const y = CENTER + RADIUS * dy;
  const tx = CENTER + 78 * dx;
  const ty = CENTER + 78 * dy;
  // A gentle bend: control point pushed sideways from the midpoint.
  const qx = (x + tx) / 2 - dy * 26;
  const qy = (y + ty) / 2 + dx * 26;
  return { x, y, d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}` };
}

const copy = {
  ar: { tabs: "اختر قناة لمشاهدة مثال لرسالة قادمة منها", incoming: "رسالة واردة", owner: "المسؤول", now: "الآن", receiving: "جاري استلام الرسالة…", hint: "اضغط على أي قناة" },
  en: { tabs: "Pick a channel to see an example incoming message", incoming: "Incoming message", owner: "Owner", now: "now", receiving: "Receiving message…", hint: "Tap any channel" }
};

export default function ChannelHub({ lang, descriptions }: { lang: Lang; descriptions: Record<HubChannel, string> }) {
  const t = copy[lang];
  const uid = useId();
  const [hubRef, inView] = useInView<HTMLDivElement>("0px", 0.3);
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const timers = useTimers();
  const [active, setActive] = useState<HubChannel>("whatsapp");
  const [delivered, setDelivered] = useState(true);
  const [pulseId, setPulseId] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const activeRef = useRef<HubChannel>("whatsapp");
  const tabRefs = useRef<Partial<Record<HubChannel, HTMLButtonElement | null>>>({});

  const activate = useCallback((channel: HubChannel) => {
    timers.clear();
    activeRef.current = channel;
    setActive(channel);
    setPulseId((id) => id + 1);
    if (reduced) {
      setDelivered(true);
      return;
    }
    setDelivered(false);
    timers.later(() => setDelivered(true), 950);
  }, [reduced, timers]);

  useEffect(() => {
    if (!inView || interacted || reduced || !pageVisible) return;
    const interval = window.setInterval(() => {
      activate(HUB_CHANNELS[(HUB_CHANNELS.indexOf(activeRef.current) + 1) % HUB_CHANNELS.length]);
    }, 4800);
    return () => window.clearInterval(interval);
  }, [inView, interacted, reduced, pageVisible, activate]);

  const choose = (channel: HubChannel) => {
    setInteracted(true);
    activate(channel);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = HUB_CHANNELS.indexOf(active);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? HUB_CHANNELS.length - 1 : (index + step + HUB_CHANNELS.length) % HUB_CHANNELS.length;
    const next = HUB_CHANNELS[nextIndex];
    choose(next);
    tabRefs.current[next]?.focus();
  };

  const sample = sampleMessages[lang][active];

  return (
    <div className={c.hub} ref={hubRef}>
      <div className={c.hubDiagram}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} className={c.hubOrbit} />
          {HUB_CHANNELS.map((channel) => (
            <path key={channel} d={geometry(channel).d} className={c.link} data-active={active === channel || undefined} style={{ "--link": channelColor[channel] } as CSSProperties} />
          ))}
          {pulseId > 0 && !reduced ? (
            <path key={pulseId} d={geometry(active).d} pathLength={100} className={c.pulse} style={{ color: channelColor[active] }} />
          ) : null}
        </svg>
        <div className={c.hubCore} data-receiving={!delivered || undefined}>
          <Image src={logo} alt="Linkly" width={64} height={35} />
        </div>
        <div role="tablist" aria-label={t.tabs} className={c.hubTabs}>
          {HUB_CHANNELS.map((channel) => {
            const point = geometry(channel);
            return (
              <button
                key={channel}
                ref={(element) => { tabRefs.current[channel] = element; }}
                type="button"
                role="tab"
                id={`${uid}-tab-${channel}`}
                aria-selected={active === channel}
                aria-controls={`${uid}-panel-${channel}`}
                tabIndex={active === channel ? 0 : -1}
                className={c.hubNode}
                data-top={ANGLES[channel] === -90 || undefined}
                style={{ "--x": `${(point.x / SIZE) * 100}%`, "--y": `${(point.y / SIZE) * 100}%`, "--c": channelColor[channel] } as CSSProperties}
                onClick={() => choose(channel)}
                onKeyDown={onKeyDown}
              >
                <ChannelGlyph channel={channel} />
                <span>{channelLabel(channel, lang)}</span>
              </button>
            );
          })}
        </div>
        <p className={c.hubHint} aria-hidden="true">{t.hint}</p>
      </div>

      <div className={c.hubPanels}>
        {HUB_CHANNELS.map((channel) => (
          <div
            key={channel}
            role="tabpanel"
            id={`${uid}-panel-${channel}`}
            aria-labelledby={`${uid}-tab-${channel}`}
            hidden={active !== channel}
            className={c.hubPanel}
            style={{ "--c": channelColor[channel] } as CSSProperties}
          >
            <header>
              <span className={c.hubPanelIcon}><ChannelGlyph channel={channel} /></span>
              <h3>{channelLabel(channel, lang)}</h3>
            </header>
            <p>{descriptions[channel]}</p>
            {active === channel ? (
              <div className={c.msgCard} data-delivered={delivered || undefined} aria-live="polite">
                <small className={c.msgLabel}>{t.incoming}</small>
                <div className={c.msgBody} key={pulseId}>
                  <div className={c.msgHead}>
                    <em>{sample.initial}</em>
                    <b>{sample.customer}</b>
                    <span className={c.msgChannel}>{channelLabel(channel, lang)}</span>
                    <time>{t.now}</time>
                  </div>
                  <p>{sample.text}</p>
                  <footer>{t.owner}: <b>{sample.employee}</b> · {sample.team}</footer>
                </div>
                <span className={c.msgWaiting} aria-hidden="true"><i /><i /><i /> {t.receiving}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
