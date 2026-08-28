"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import type { TeamRow } from "../types";
import { formatNumber } from "../utils";
import { useLanguage } from "../i18n";

type TeamViewProps = {
  team: TeamRow[];
  currentUserId: string;
};

export default function TeamView({ team, currentUserId }: TeamViewProps) {
  const router = useRouter();
  const { t } = useLanguage();
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
      setTeamFormError(result.error || t("تعذر إضافة العضو", "Failed to add member"));
      return;
    }

    setTeamInviteNotice(result.data?.delivery?.message || t("تم إنشاء الحساب.", "Account created."));
    setTeamActivationUrl(result.data?.delivery?.activationUrl || "");
    router.refresh();
  }

  async function handleRevokeTeamMember(memberId: string) {
    if (!window.confirm(t("هل تريد إزالة صلاحية الأدمن عن هذا العضو؟", "Remove admin access from this member?"))) return;

    setRevokingId(memberId);
    const response = await fetch(`/api/admin/team/${memberId}`, { method: "DELETE" });
    const result = (await response.json()) as { ok: boolean; error?: string };
    setRevokingId("");

    if (!response.ok || !result.ok) {
      window.alert(result.error || t("تعذر إزالة الصلاحية", "Failed to remove access"));
      return;
    }

    router.refresh();
  }

  return (
    <>
      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>{t("إجمالي الأعضاء", "Total members")}</span>
            <strong>{formatNumber(team.length)}</strong>
            <small>{t("يملكون صلاحية الوصول للوحة", "Have access to the dashboard")}</small>
          </article>
          <article>
            <span>{t("أقدم عضو", "Oldest member")}</span>
            <strong>{oldestMember ? oldestMember.name : "—"}</strong>
            <small>{oldestMember ? oldestMember.createdAt : t("لا يوجد بعد", "None yet")}</small>
          </article>
          <article>
            <span>{t("أحدث عضو", "Newest member")}</span>
            <strong>{newestMember ? newestMember.name : "—"}</strong>
            <small>{newestMember ? newestMember.createdAt : t("لا يوجد بعد", "None yet")}</small>
          </article>
          <article>
            <span>{t("حسابك", "Your account")}</span>
            <strong>{team.find((m) => m.id === currentUserId)?.name || "—"}</strong>
            <small>{t("أنت مسجّل دخول بهذا الحساب", "You are signed in with this account")}</small>
          </article>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>{t(`فريق المنصة (${formatNumber(visibleTeam.length)} من ${formatNumber(team.length)})`, `Platform Team (${formatNumber(visibleTeam.length)} of ${formatNumber(team.length)})`)}</h2>
            <p>{t("الأعضاء الذين يملكون صلاحية الوصول لهذه اللوحة.", "Members who have access to this dashboard.")}</p>
          </div>
          <div className="admin-card-actions">
            <button type="button" onClick={() => { setIsTeamInviteOpen(true); setTeamFormError(""); setTeamInviteNotice(""); setTeamActivationUrl(""); }}>
              {t("إضافة عضو", "Add Member")}
            </button>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            type="search"
            className="admin-search-input"
            placeholder={t("ابحث بالاسم أو البريد الإلكتروني...", "Search by name or email...")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className="admin-team-cards">
          {visibleTeam.map((member) => {
            const isSelf = member.id === currentUserId;
            return (
              <article className="admin-team-card" key={member.id}>
                <div className="admin-team-avatar">{member.name.slice(0, 1) || t("ع", "M")}</div>
                <div className="admin-team-info">
                  <strong>{member.name}</strong>
                  <span dir="ltr">{member.email}</span>
                  <small>{t(`عضو منذ ${member.createdAt}`, `Member since ${member.createdAt}`)}</small>
                </div>
                {isSelf ? (
                  <span className="admin-pill is-warn">{t("أنت", "You")}</span>
                ) : (
                  <button type="button" disabled={revokingId === member.id} onClick={() => handleRevokeTeamMember(member.id)}>
                    {revokingId === member.id ? t("جاري الإزالة...", "Removing...") : t("إزالة الصلاحية", "Revoke access")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {team.length === 0 ? (
          <p className="admin-empty-state">{t("لا يوجد أعضاء بعد.", "No members yet.")}</p>
        ) : visibleTeam.length === 0 ? (
          <p className="admin-empty-state">{t("لا توجد نتائج مطابقة للبحث.", "No results match your search.")}</p>
        ) : null}
      </section>

      {isTeamInviteOpen ? (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="team-invite-title">
          <div className="admin-modal-card">
            <div className="admin-modal-head">
              <div>
                <h2 id="team-invite-title">{t("إضافة عضو لفريق المنصة", "Add a Platform Team Member")}</h2>
                <p>{t("ينشئ هذا حساب دخول حقيقي بصلاحية أدمن ويرسل رابط تفعيل على بريده.", "This creates a real admin login account and sends an activation link to their email.")}</p>
              </div>
              <button type="button" onClick={() => { setIsTeamInviteOpen(false); setTeamInviteNotice(""); setTeamActivationUrl(""); }} aria-label={t("إغلاق", "Close")}>
                ×
              </button>
            </div>

            {teamInviteNotice ? (
              <div className="admin-invite-result">
                <p>{teamInviteNotice}</p>
                {teamActivationUrl ? (
                  <a className="activation-link" href={teamActivationUrl} target="_blank" rel="noreferrer">
                    {t("فتح رابط التفعيل", "Open activation link")}
                  </a>
                ) : null}
                <div className="admin-form-actions">
                  <button type="button" onClick={() => { setIsTeamInviteOpen(false); setTeamInviteNotice(""); setTeamActivationUrl(""); }}>
                    {t("تم", "Done")}
                  </button>
                </div>
              </div>
            ) : (
              <form className="admin-client-form" onSubmit={handleInviteTeamMember}>
                <label>
                  {t("الاسم", "Name")}
                  <input name="name" placeholder={t("اسم العضو", "Member name")} required />
                </label>
                <label>
                  {t("البريد الإلكتروني", "Email")}
                  <input name="email" type="email" dir="ltr" placeholder="admin@example.com" required />
                </label>

                {teamFormError ? <p className="admin-form-error">{teamFormError}</p> : null}

                <div className="admin-form-actions">
                  <button type="button" onClick={() => setIsTeamInviteOpen(false)}>
                    {t("إلغاء", "Cancel")}
                  </button>
                  <button type="submit" disabled={isTeamSaving}>
                    {isTeamSaving ? t("جاري الحفظ...", "Saving...") : t("إضافة", "Add")}
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
