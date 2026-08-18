"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import type { TeamRow } from "../types";
import { formatNumber } from "../utils";

type TeamViewProps = {
  team: TeamRow[];
  currentUserId: string;
};

export default function TeamView({ team, currentUserId }: TeamViewProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isTeamInviteOpen, setIsTeamInviteOpen] = useState(false);
  const [isTeamSaving, setIsTeamSaving] = useState(false);
  const [teamFormError, setTeamFormError] = useState("");
  const [teamInviteNotice, setTeamInviteNotice] = useState("");
  const [teamActivationUrl, setTeamActivationUrl] = useState("");
  const [revokingId, setRevokingId] = useState("");

  const oldestMember = team.length ? [...team].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] : null;
  const newestMember = team.length ? [...team].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : null;

  const visibleTeam = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return team;
    return team.filter((member) => member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query));
  }, [team, searchQuery]);

  async function handleInviteTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTeamSaving(true);
    setTeamFormError("");
    setTeamInviteNotice("");
    setTeamActivationUrl("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || "")
    };

    const response = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      data?: { delivery?: { message?: string; activationUrl?: string } };
    };

    setIsTeamSaving(false);

    if (!response.ok || !result.ok) {
      setTeamFormError(result.error || "تعذر إضافة العضو");
      return;
    }

    setTeamInviteNotice(result.data?.delivery?.message || "تم إنشاء الحساب.");
    setTeamActivationUrl(result.data?.delivery?.activationUrl || "");
    router.refresh();
  }

  async function handleRevokeTeamMember(memberId: string) {
    if (!window.confirm("هل تريد إزالة صلاحية الأدمن عن هذا العضو؟")) return;

    setRevokingId(memberId);
    const response = await fetch(`/api/admin/team/${memberId}`, { method: "DELETE" });
    const result = (await response.json()) as { ok: boolean; error?: string };
    setRevokingId("");

    if (!response.ok || !result.ok) {
      window.alert(result.error || "تعذر إزالة الصلاحية");
      return;
    }

    router.refresh();
  }

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>إجمالي الأعضاء</span>
            <strong>{formatNumber(team.length)}</strong>
            <small>يملكون صلاحية الوصول للوحة</small>
          </article>
          <article>
            <span>أقدم عضو</span>
            <strong>{oldestMember ? oldestMember.name : "—"}</strong>
            <small>{oldestMember ? oldestMember.createdAt : "لا يوجد بعد"}</small>
          </article>
          <article>
            <span>أحدث عضو</span>
            <strong>{newestMember ? newestMember.name : "—"}</strong>
            <small>{newestMember ? newestMember.createdAt : "لا يوجد بعد"}</small>
          </article>
          <article>
            <span>حسابك</span>
            <strong>{team.find((m) => m.id === currentUserId)?.name || "—"}</strong>
            <small>أنت مسجّل دخول بهذا الحساب</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>فريق المنصة ({formatNumber(visibleTeam.length)} من {formatNumber(team.length)})</h2>
            <p>الأعضاء الذين يملكون صلاحية الوصول لهذه اللوحة.</p>
          </div>
          <div className="admin-card-actions">
            <button type="button" onClick={() => { setIsTeamInviteOpen(true); setTeamFormError(""); setTeamInviteNotice(""); setTeamActivationUrl(""); }}>
              إضافة عضو
            </button>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder="ابحث بالاسم أو البريد الإلكتروني..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className="admin-team-cards">
          {visibleTeam.map((member) => {
            const isSelf = member.id === currentUserId;
            return (
              <article className="admin-team-card" key={member.id}>
                <div className="admin-team-avatar">{member.name.slice(0, 1) || "ع"}</div>
                <div className="admin-team-info">
                  <strong>{member.name}</strong>
                  <span dir="ltr">{member.email}</span>
                  <small>عضو منذ {member.createdAt}</small>
                </div>
                {isSelf ? (
                  <span className="admin-pill is-warn">أنت</span>
                ) : (
                  <button type="button" disabled={revokingId === member.id} onClick={() => handleRevokeTeamMember(member.id)}>
                    {revokingId === member.id ? "جاري الإزالة..." : "إزالة الصلاحية"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {team.length === 0 ? (
          <p className="admin-empty-state">لا يوجد أعضاء بعد.</p>
        ) : visibleTeam.length === 0 ? (
          <p className="admin-empty-state">لا توجد نتائج مطابقة للبحث.</p>
        ) : null}
      </section>

      {isTeamInviteOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="team-invite-title">
          <div className="admin-modal-card">
            <div className="admin-modal-head">
              <div>
                <h2 id="team-invite-title">إضافة عضو لفريق المنصة</h2>
                <p>ينشئ هذا حساب دخول حقيقي بصلاحية أدمن ويرسل رابط تفعيل على بريده.</p>
              </div>
              <button type="button" onClick={() => { setIsTeamInviteOpen(false); setTeamInviteNotice(""); setTeamActivationUrl(""); }} aria-label="إغلاق">
                ×
              </button>
            </div>

            {teamInviteNotice ? (
              <div className="admin-invite-result">
                <p>{teamInviteNotice}</p>
                {teamActivationUrl ? (
                  <a className="activation-link" href={teamActivationUrl} target="_blank" rel="noreferrer">
                    فتح رابط التفعيل
                  </a>
                ) : null}
                <div className="admin-form-actions">
                  <button type="button" onClick={() => { setIsTeamInviteOpen(false); setTeamInviteNotice(""); setTeamActivationUrl(""); }}>
                    تم
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleInviteTeamMember}>
                <label>
                  الاسم
                  <input name="name" placeholder="اسم العضو" required />
                </label>
                <label>
                  البريد الإلكتروني
                  <input name="email" type="email" dir="ltr" placeholder="admin@example.com" required />
                </label>

                {teamFormError ? <p className="admin-form-error">{teamFormError}</p> : null}

                <div className="admin-form-actions">
                  <button type="button" onClick={() => setIsTeamInviteOpen(false)}>
                    إلغاء
                  </button>
                  <button type="submit" disabled={isTeamSaving}>
                    {isTeamSaving ? "جاري الحفظ..." : "إضافة"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
