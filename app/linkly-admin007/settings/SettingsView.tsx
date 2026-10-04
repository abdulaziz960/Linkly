"use client";

import { useEffect, useState } from "react";
import { Button, Segmented, Section } from "../ds/primitives";
import { useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import { useTheme } from "../ds/theme";

const SOUND_STORAGE_KEY = "audiencew_admin_notification_sound";

function formatLastLogin(value: string) {
  if (!value) return "غير متاح";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(time);
}

export default function SettingsView({ name, email, lastLoginAt }: { name: string; email: string; lastLoginAt: string }) {
  const { theme, setTheme } = useTheme();
  const confirm = useConfirm();
  const toast = useToast();
  const [sound, setSound] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    try {
      setSound(window.localStorage.getItem(SOUND_STORAGE_KEY) === "on");
    } catch {
      setSound(false);
    }
  }, []);

  function updateSound(next: boolean) {
    setSound(next);
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");
      toast("success", next ? "تم تفعيل التنبيه الصوتي" : "تم إيقاف التنبيه الصوتي");
    } catch {
      toast("error", "تعذر حفظ التفضيل", "المتصفح لا يسمح بحفظ الإعدادات في هذا الوضع.");
    }
  }

  async function signOut() {
    if (signingOut) return;
    const ok = await confirm({ title: "تسجيل الخروج", description: "سيتم إنهاء جلستك الحالية في لوحة التحكم.", confirmLabel: "تسجيل الخروج" });
    if (!ok) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("logout failed");
      window.location.replace("/login");
    } catch {
      setSigningOut(false);
      toast("error", "تعذر تسجيل الخروج", "حاول مرة أخرى.");
    }
  }

  return (
    <div className="ds-grid-2" style={{ alignItems: "start" }}>
      <div>
        <Section title="الحساب" description="بيانات الدخول الخاصة بك. لتغيير كلمة المرور استخدم «نسيت كلمة المرور» من صفحة الدخول.">
          <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="ds-avatar" style={{ width: 52, height: 52, fontSize: 20 }} aria-hidden="true">{name.slice(0, 1)}</span>
              <div style={{ display: "grid" }}>
                <strong style={{ fontSize: 17 }}>{name}</strong>
                <span dir="ltr" style={{ color: "var(--ds-text-muted)", textAlign: "start" }}>{email}</span>
              </div>
            </div>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", margin: 0, fontSize: 14 }}>
              <dt style={{ color: "var(--ds-text-muted)" }}>الدور</dt><dd style={{ margin: 0, fontWeight: 700 }}>مدير المنصة</dd>
              <dt style={{ color: "var(--ds-text-muted)" }}>آخر تسجيل دخول</dt><dd style={{ margin: 0, fontWeight: 700 }}>{formatLastLogin(lastLoginAt)}</dd>
            </dl>
          </div>
        </Section>

        <Section title="الجلسة">
          <div className="ds-card ds-card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: "var(--ds-text-muted)", fontSize: 14 }}>إنهاء جلستك على هذا الجهاز.</span>
            <Button variant="outline" icon="logout" loading={signingOut} onClick={signOut}>تسجيل الخروج</Button>
          </div>
        </Section>
      </div>

      <div>
        <Section title="المظهر" description="يُحفظ اختيارك على هذا المتصفح.">
          <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 10 }}>
            <Segmented label="مظهر اللوحة" value={theme} onChange={setTheme} options={[{ value: "light", label: "فاتح" }, { value: "dark", label: "داكن" }]} />
          </div>
        </Section>

        <Section title="التنبيهات">
          <div className="ds-card ds-card-pad">
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
              <span style={{ display: "grid", gap: 3 }}>
                <strong style={{ fontSize: 14.5 }}>تنبيه صوتي للإشعارات الجديدة</strong>
                <small style={{ color: "var(--ds-text-muted)" }}>يصدر نغمة قصيرة عند وصول إشعار جديد أثناء فتح اللوحة.</small>
              </span>
              <input type="checkbox" checked={sound} onChange={(event) => updateSound(event.target.checked)} style={{ width: 20, height: 20 }} />
            </label>
          </div>
        </Section>

        <Section title="اختصارات لوحة المفاتيح">
          <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 10, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>البحث الشامل</span><span><kbd className="ds-kbd">/</kbd> أو <kbd className="ds-kbd" dir="ltr">Ctrl + K</kbd></span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>إغلاق النوافذ والقوائم</span><kbd className="ds-kbd">Esc</kbd></div>
          </div>
        </Section>
      </div>
    </div>
  );
}
