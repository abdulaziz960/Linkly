"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

const copy = {
  ar: {
    ariaLabel: "اختر الشركة التي تريد الدخول إليها",
    tagline: "حسابك عضو في أكثر من شركة",
    heading: "اختر الشركة",
    loading: "جاري تحميل الشركات...",
    error: "تعذر تحميل قائمة الشركات، حاول تحديث الصفحة",
    switching: "جاري الدخول...",
    genericError: "تعذر الدخول لهذه الشركة"
  },
  en: {
    ariaLabel: "Choose which company to enter",
    tagline: "Your account belongs to more than one company",
    heading: "Choose a company",
    loading: "Loading your companies...",
    error: "Couldn't load your companies, try refreshing the page",
    switching: "Entering...",
    genericError: "Couldn't enter this company"
  }
} as const;

type Workspace = { tenantId: string; role: string; companyName: string; active: boolean };

export default function ChooseWorkspacePageClient() {
  const router = useRouter();
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const text = copy[lang];
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pickError, setPickError] = useState("");
  const [enteringId, setEnteringId] = useState("");

  useEffect(() => {
    fetch("/api/auth/my-workspaces")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: { data?: Workspace[] }) => setWorkspaces(payload.data || []))
      .catch(() => setLoadError(text.error));
    // Only ever needs to load once - the language toggle shouldn't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enterWorkspace(tenantId: string) {
    setPickError("");
    setEnteringId(tenantId);
    try {
      const response = await fetch("/api/auth/switch-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId })
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        setPickError(payload.error || text.genericError);
        setEnteringId("");
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem("audiencew:dashboard-active-view", "inbox");
        window.localStorage.removeItem("audiencew:dashboard-active-channel");
      }
      router.push("/dashboard?view=inbox");
      router.refresh();
    } catch {
      setPickError(text.genericError);
      setEnteringId("");
    }
  }

  return (
    <main className="login-page" dir={lang === "ar" ? "rtl" : "ltr"}>
      <section className="login-panel" aria-label={text.ariaLabel}>
        <div className="login-lang-toggle">
          <button type="button" aria-pressed={lang === "ar"} className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>العربية</button>
          <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
        </div>

        <div className="login-brand">
          <Image src="/assets/linkly-logo.png" alt="" width={72} height={40} />
          <div>
            <span>Linkly</span>
            <b>{text.tagline}</b>
          </div>
        </div>

        <div className="login-copy">
          <p>{text.heading}</p>
        </div>

        {loadError ? <p className="login-error" role="alert">{loadError}</p> : null}
        {pickError ? <p className="login-error" role="alert">{pickError}</p> : null}

        {!workspaces && !loadError ? <p className="workspace-pick-loading">{text.loading}</p> : null}

        {workspaces ? (
          <div className="workspace-pick-list">
            {workspaces.map((workspace) => (
              <button
                key={workspace.tenantId}
                type="button"
                className="workspace-pick-item"
                disabled={enteringId === workspace.tenantId}
                onClick={() => void enterWorkspace(workspace.tenantId)}
              >
                <span>{workspace.companyName || workspace.tenantId}</span>
                <small>{workspace.role}</small>
                {enteringId === workspace.tenantId ? <em>{text.switching}</em> : null}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
