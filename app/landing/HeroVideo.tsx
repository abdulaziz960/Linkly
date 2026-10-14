"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "./motion";
import styles from "./heroVideo.module.css";

const BASE = "/assets/video";
const POSTER = `${BASE}/linkly-hero-poster.jpg`;

type Mode = "silent" | "sound";

// A phone on a metered connection should not pull several MB just by scrolling past.
function saveDataOn() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

/**
 * The introduction film. It shows the poster until the section is near the screen, then plays the
 * silent loop (and pauses again when it scrolls away). Visitors who ask for less motion or less data
 * get the poster and a play button instead. "Play sound" switches to the narrated version.
 */
export default function HeroVideo() {
  const [wrapRef, inView] = useInView<HTMLDivElement>("200px", 0.25);
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>("silent");
  const [requested, setRequested] = useState(false);
  const [saveData] = useState(() => (typeof navigator === "undefined" ? false : saveDataOn()));

  // Autoplay only for visitors who did not ask for less motion / less data; anyone can press play.
  const autoplay = !reducedMotion && !saveData;
  const active = requested || (autoplay && inView);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView && active) void video.play().catch(() => undefined);
    else video.pause();
  }, [inView, active, mode]);

  function start() {
    setRequested(true);
  }

  function toggleSound() {
    setRequested(true);
    setMode((current) => (current === "silent" ? "sound" : "silent"));
  }

  return (
    <div className={styles.frame} ref={wrapRef} dir="rtl">
      {active ? (
        <video
          key={mode}
          ref={videoRef}
          className={styles.video}
          poster={POSTER}
          playsInline
          autoPlay
          muted={mode === "silent"}
          loop={mode === "silent"}
          controls={mode === "sound"}
          preload="none"
          aria-label="فيديو تعريفي بمنصة لنكلي"
          onEnded={() => setMode("silent")}
        >
          {mode === "silent" ? (
            <>
              <source src={`${BASE}/linkly-hero.webm`} type="video/webm" />
              <source src={`${BASE}/linkly-hero.mp4`} type="video/mp4" />
            </>
          ) : (
            <source src={`${BASE}/linkly-hero-sound.mp4`} type="video/mp4" />
          )}
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.video} src={POSTER} alt="لقطة من فيديو لنكلي: كل محادثاتك بمكان واحد" loading="lazy" width={1920} height={1080} />
      )}
      {!active ? (
        <button type="button" className={styles.play} onClick={start} aria-label="تشغيل الفيديو">
          <span aria-hidden="true">▶</span>
        </button>
      ) : null}
      <button type="button" className={styles.sound} onClick={toggleSound} aria-pressed={mode === "sound"}>
        {mode === "sound" ? "كتم الصوت" : "تشغيل الصوت"}
      </button>
    </div>
  );
}
