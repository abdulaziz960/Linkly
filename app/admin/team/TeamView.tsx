"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import type { TeamRow } from "../types";

type TeamViewProps = {
  team: TeamRow[];
  currentUserId: string;
};

export default function TeamView({ team, currentUserId }: TeamViewProps) {
  const router = useRouter();
  const [isTeamInviteOpen, setIsTeamInviteOpen] = useState(false);
  const [isTeamSaving, setIsTeamSaving] = useState(false);
  const [teamFormError, setTeamFormError] = useState("");
  const [teamInviteNotice, setTeamInviteNotice] = useState("");
  const [teamActivationUrl, setTeamActivationUrl] = useState("");
  const [revokingId, setRevokingId] = useState("");

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
      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h2>فريق المنصة</h2>
            <p>الأعضاء الذين يملكون صلاحية الوصول لهذه اللوحة.</p>
          </div>
          <div className="admin-card-actions">
            <button type="button" onClick={() => { setIsTeamInviteOpen(true); setTeamFormError(""); setTeamInviteNotice(""); setTeamActivationUrl(""); }}>
              إضافة عضو
            </button>
          </div>
        </div>
        <div className="admin-list">
          {team.map((member) => (
            <div className="admin-list-row" key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <span dir="ltr">{member.email}</span>
              </div>
              <span className="admin-pill is-good">{member.createdAt}</span>
              {member.id !== currentUserId ? (
                <button type="button" disabled={revokingId === member.id} onClick={() => handleRevokeTeamMember(member.id)}>
                  {revokingId === member.id ? "جاري الإزالة..." : "إزالة الصلاحية"}
                </button>
              ) : (
                <span className="admin-pill is-warn">أنت</span>
              )}
            </div>
          ))}
          {team.length === 0 ? <p className="admin-empty-state">لا يوجد أعضاء بعد.</p> : null}
        </div>
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
