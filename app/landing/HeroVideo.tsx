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
  // The visitor's own pause; the loop then stays still even when it scrolls back into view.
  const [paused, setPaused] = useState(false);
  const [saveData] = useState(() => (typeof navigator === "undefined" ? false : saveDataOn()));

  // Autoplay only for visitors who did not ask for less motion / less data; anyone can press play.
  const autoplay = !reducedMotion && !saveData;
  const active = requested || (autoplay && inView);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView && active && !paused) void video.play().catch(() => undefined);
    else video.pause();
  }, [inView, active, mode, paused]);

  function start() {
    setRequested(true);
    setPaused(false);
  }

  function togglePause() {
    setRequested(true);
    setPaused((current) => !current);
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
          autoPlay={!paused}
          muted={mode === "silent"}
          loop={mode === "silent"}
          controls={mode === "sound"}
          preload="none"
          aria-label="فيديو تعريفي بمنصة لنكلي"
          onEnded={() => setMode("silent")}
          onPause={(event) => { if (mode === "sound" && !event.currentTarget.ended) setPaused(true); }}
          onPlay={() => setPaused(false)}
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
        <img
          className={styles.video}
          src={POSTER}
          srcSet={`${BASE}/linkly-hero-poster-640.webp 640w, ${BASE}/linkly-hero-poster-1280.webp 1280w, ${POSTER} 1920w`}
          sizes="(max-width: 1100px) 100vw, 1040px"
          alt="لقطة من فيديو لنكلي: كل محادثاتك بمكان واحد"
          loading="lazy"
          decoding="async"
          width={1920}
          height={1080}
        />
      )}
      {!active ? (
        <button type="button" className={styles.play} onClick={start} aria-label="تشغيل الفيديو">
          <span aria-hidden="true">▶</span>
        </button>
      ) : null}
      <div className={styles.controls}>
        {active && mode === "silent" ? (
          <button type="button" className={styles.sound} onClick={togglePause} aria-pressed={paused}>
            {paused ? "تشغيل الفيديو" : "إيقاف الفيديو"}
          </button>
        ) : null}
        <button type="button" className={styles.sound} onClick={toggleSound} aria-pressed={mode === "sound"}>
          {mode === "sound" ? "كتم الصوت" : "تشغيل الصوت"}
        </button>
      </div>
    </div>
  );
}
