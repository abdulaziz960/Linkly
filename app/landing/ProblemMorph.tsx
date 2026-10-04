"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import logo from "../../public/assets/linkly-logo.png";
import c from "./landing.module.css";
import { ChannelGlyph, HUB_CHANNELS, channelColor, channelLabel, type Lang } from "./channelData";
import { useInView } from "./motion";

const BADGES = [3, 7, 2, 5, 1, 4];

// Scattered app icons with unread badges settle into one Linkly inbox once the
// visual scrolls into view (pure CSS transitions keyed off data-state).
export default function ProblemMorph({ lang, title, text }: { lang: Lang; title: string; text: string }) {
  const [ref, inView] = useInView<HTMLDivElement>("0px 0px -15% 0px", 0.35);
  const [unified, setUnified] = useState(false);

  useEffect(() => {
    if (!inView || unified) return;
    const id = window.setTimeout(() => setUnified(true), 500);
    return () => window.clearTimeout(id);
  }, [inView, unified]);

  return (
    <div ref={ref} className={c.morph} data-state={unified ? "unified" : "chaos"}>
      <div className={c.morphIcons}>
        {HUB_CHANNELS.map((channel, i) => (
          <i key={channel} title={channelLabel(channel, lang)} style={{ "--c": channelColor[channel], "--i": i } as CSSProperties}>
            <ChannelGlyph channel={channel} />
            <b aria-hidden="true">{BADGES[i]}</b>
          </i>
        ))}
      </div>
      <span className={c.morphArrow} aria-hidden="true">{lang === "ar" ? "←" : "→"}</span>
      <article className={c.morphInbox}>
        <Image src={logo} alt="" width={64} height={35} />
        <div>
          <b>{title}</b>
          <p>{text}</p>
        </div>
      </article>
    </div>
  );
}
