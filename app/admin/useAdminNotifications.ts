"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AdminNotification = {
  id: string;
  type: "renewal" | "log";
  level: "معلومة" | "تنبيه" | "خطأ";
  title: string;
  message: string;
  at: string;
  clientName: string;
  tenantId: string;
};

const SEEN_STORAGE_KEY = "audiencew_admin_seen_notifications";
const SOUND_STORAGE_KEY = "audiencew_admin_notification_sound";
const POLL_INTERVAL_MS = 20000;

function readSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeSeenIds(ids: Set<string>) {
  window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    [880, 1320].forEach((freq, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      const start = now + index * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });

    window.setTimeout(() => ctx.close(), 700);
  } catch {
    // Audio isn't available (autoplay restrictions, unsupported browser) - fail silently.
  }
}

export function useAdminNotifications() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const soundEnabledRef = useRef(true);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(SOUND_STORAGE_KEY);
    const enabled = stored !== "off";
    setSoundEnabledState(enabled);
    soundEnabledRef.current = enabled;
  }, []);

  const setSoundEnabled = useCallback((value: boolean) => {
    setSoundEnabledState(value);
    soundEnabledRef.current = value;
    window.localStorage.setItem(SOUND_STORAGE_KEY, value ? "on" : "off");
  }, []);

  const fetchNotifications = useCallback(async () => {
    const response = await fetch("/api/admin/notifications");
    if (!response.ok) return;
    const result = (await response.json()) as { ok: boolean; data?: AdminNotification[] };
    if (!result.ok || !result.data) return;

    const seenIds = readSeenIds();
    const newIds = new Set(result.data.filter((item) => !seenIds.has(item.id)).map((item) => item.id));

    if (!isFirstLoad.current && newIds.size > 0 && soundEnabledRef.current) {
      playChime();
    }
    isFirstLoad.current = false;

    setItems(result.data);
    setUnreadIds(newIds);
  }, []);

  const markAllRead = useCallback(() => {
    setItems((current) => {
      writeSeenIds(new Set(current.map((item) => item.id)));
      return current;
    });
    setUnreadIds(new Set());
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = window.setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchNotifications]);

  return {
    items,
    unreadCount: unreadIds.size,
    unreadIds,
    soundEnabled,
    setSoundEnabled,
    markAllRead,
    refresh: fetchNotifications
  };
}
