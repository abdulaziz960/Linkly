"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TeamRow } from "../types";
import { formatNumber } from "../utils";
import { Badge, Button, EmptyState, Section, StatCard } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import Icon from "../ds/Icon";
import { useQueryFlag } from "../ds/useQueryFlag";
import { filterTeam, teamExtremes, validateInvite } from "./team-data";

type Props = { team: TeamRow[]; currentUserId: string };

export default function TeamView({ team, currentUserId }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activationUrl, setActivationUrl] = useState("");
  const [revokingId, setRevokingId] = useState("");

  const visible = useMemo(() => filterTeam(team, query), [team, query]);
  const { oldest, newest } = useMemo(() => teamExtremes(team), [team]);
  const me = team.find((member) => member.id === currentUserId);

  function openInvite() {
    setName("");
    setEmail("");
    setError("");
    setNotice("");
    setActivationUrl("");
    setInviteOpen(true);
  }
  useQueryFlag("invite", openInvite);

  function closeInvite() {
    if (!saving) setInviteOpen(false);
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const problem = validateInvite(name, email, team);
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim() }) });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: { delivery?: { message?: string; activationUrl?: string } } };
      if (!response.ok || !result.ok) return setError(result.error || "تعذر إضافة العضو");
      setNotice(result.data?.delivery?.message || "تم إنشاء الحساب.");
      setActivationUrl(result.data?.delivery?.activationUrl || "");
      toast("success", "تمت إضافة العضو");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(activationUrl);
      toast("success", "تم نسخ رابط التفعيل");
    } catch {
      toast("error", "تعذر النسخ", "انسخ الرابط يدويًا من الحقل.");
    }
  }

  async function revoke(member: TeamRow) {
    const ok = await confirm({
      title: `إزالة صلاحية «${member.name}»؟`,
      description: "سيفقد العضو الوصول إلى لوحة الأدمن فورًا. لا يُحذف حسابه.",
      confirmLabel: "إزالة الصلاحية",
      tone: "danger"
    });
    if (!ok) return;
    setRevokingId(member.id);
    try {
      const response = await fetch(`/api/admin/team/${member.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) return toast("error", "تعذر إزالة الصلاحية", result.error);
      toast("success", "تمت إزالة الصلاحية");
      router.refresh();
    } catch {
      toast("error", "تعذر الاتصال بالخادم");
    } finally {
      setRevokingId("");
    }
  }

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="إجمالي الأعضاء" value={formatNumber(team.length)} hint="يملكون صلاحية الوصول للوحة" icon="shield" />
        {oldest ? <StatCard label="أقدم عضو" value={oldest.name} hint={oldest.createdAt} icon="user" /> : null}
        {newest ? <StatCard label="أحدث عضو" value={newest.name} hint={newest.createdAt} icon="user" /> : null}
        <StatCard label="حسابك" value={me?.name || "—"} hint="أنت مسجّل دخول بهذا الحساب" icon="checkCircle" tone="success" />
      </div>

      <Section
        title={`فريق المنصة (${formatNumber(visible.length)} من ${formatNumber(team.length)})`}
        description="الأعضاء الذين يملكون صلاحية الوصول لهذه اللوحة."
        actions={<Button variant="primary" icon="plus" onClick={openInvite}>إضافة عضو</Button>}
      >
        <div className="ds-toolbar">
          <div className="ds-search">
            <Icon name="search" size={17} />
            <input className="ds-input" type="search" placeholder="ابحث بالاسم أو البريد الإلكتروني…" aria-label="بحث في الفريق" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>

        {team.length === 0 ? (
          <EmptyState icon="shield" title="لا يوجد أعضاء بعد" description="أضف أول عضو ليحصل على صلاحية الوصول." action={<Button variant="primary" icon="plus" onClick={openInvite}>إضافة عضو</Button>} />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="لا توجد نتائج مطابقة" description="جرّب تغيير كلمات البحث." />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th scope="col">العضو</th>
                  <th scope="col">عضو منذ</th>
                  <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((member) => {
                  const isSelf = member.id === currentUserId;
                  return (
                    <tr key={member.id}>
                      <td data-cell="main">
                        <div className="ds-cell-main">
                          <span className="ds-avatar" aria-hidden="true">{member.name.slice(0, 1) || "ع"}</span>
                          <div><strong>{member.name}</strong><span><bdi dir="ltr">{member.email}</bdi></span></div>
                        </div>
                      </td>
                      <td data-label="عضو منذ">{member.createdAt}</td>
                      <td>
                        <div className="ds-cell-actions">
                          {isSelf ? <Badge tone="info">أنت</Badge> : <Button variant="outline" loading={revokingId === member.id} onClick={() => void revoke(member)}>إزالة الصلاحية</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Dialog
        open={inviteOpen}
        onClose={closeInvite}
        title={notice ? "تمت إضافة العضو" : "إضافة عضو لفريق المنصة"}
        description={notice ? undefined : "ينشئ حساب دخول حقيقيًا بصلاحية أدمن ويرسل رابط تفعيل إلى بريده."}
        footer={notice ? <Button variant="primary" onClick={closeInvite}>تم</Button> : <><Button variant="outline" onClick={closeInvite}>إلغاء</Button><Button variant="primary" type="submit" form="team-invite-form" loading={saving}>إضافة</Button></>}
      >
        {notice ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0 }}>{notice}</p>
            {activationUrl ? (
              <>
                <input className="ds-input" readOnly dir="ltr" value={activationUrl} aria-label="رابط التفعيل" onFocus={(event) => event.currentTarget.select()} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="outline" icon="external" onClick={() => window.open(activationUrl, "_blank", "noreferrer")}>فتح رابط التفعيل</Button>
                  <Button variant="outline" onClick={() => void copyLink()}>نسخ الرابط</Button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <form id="team-invite-form" onSubmit={invite} style={{ display: "grid", gap: 14 }}>
            <label className="ds-field">الاسم<input data-autofocus className="ds-input" required placeholder="اسم العضو" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="ds-field">البريد الإلكتروني<input className="ds-input" type="email" dir="ltr" required placeholder="admin@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        )}
      </Dialog>
    </>
  );
}
