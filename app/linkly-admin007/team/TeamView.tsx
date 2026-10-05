"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TeamRow } from "../types";
import { formatNumber, parseTimestamp } from "../utils";
import { relativeTime } from "../activity";
import { ADMIN_PERMISSIONS, PERMISSION_LABELS, PERMISSION_PRESETS, type AdminPermission } from "../../../lib/admin-permissions";
import { Badge, Button, EmptyState, Section, StatCard } from "../ds/primitives";
import { Dialog, useConfirm } from "../ds/Dialog";
import { useToast } from "../ds/Toast";
import ActionMenu from "../ds/ActionMenu";
import Icon from "../ds/Icon";
import { adminRequest } from "../ds/forms";
import { useQueryFlag } from "../ds/useQueryFlag";
import { filterTeam, teamExtremes, validateInvite } from "./team-data";

type Props = { team: TeamRow[]; currentUserId: string; generatedAt: number };

const FULL = [...ADMIN_PERMISSIONS] as AdminPermission[];

function PermissionPicker({ value, onChange }: { value: AdminPermission[]; onChange: (next: AdminPermission[]) => void }) {
  const same = (a: AdminPermission[], b: AdminPermission[]) => a.length === b.length && a.every((item) => b.includes(item));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="ds-field">
        <span>قوالب جاهزة</span>
        <div className="ds-chip-row">
          {PERMISSION_PRESETS.map((preset) => (
            <button key={preset.id} type="button" className="ds-chip" aria-pressed={same(value, preset.permissions)} onClick={() => onChange([...preset.permissions])}>{preset.label}</button>
          ))}
        </div>
      </div>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: 8 }}>
        <legend style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>الصلاحيات</legend>
        {ADMIN_PERMISSIONS.map((permission) => (
          <label key={permission} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", border: "1px solid var(--ds-border)", borderRadius: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={value.includes(permission)}
              onChange={(event) => onChange(event.target.checked ? [...value, permission] : value.filter((item) => item !== permission))}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--ds-brand)" }}
            />
            <span style={{ display: "grid", gap: 2 }}>
              <strong style={{ fontSize: 14 }}>{PERMISSION_LABELS[permission].label}</strong>
              <small style={{ color: "var(--ds-text-muted)" }}>{PERMISSION_LABELS[permission].hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export default function TeamView({ team, currentUserId, generatedAt }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [invitePermissions, setInvitePermissions] = useState<AdminPermission[]>(FULL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activationUrl, setActivationUrl] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [editPermissions, setEditPermissions] = useState<AdminPermission[]>(FULL);
  const [editError, setEditError] = useState("");

  const visible = useMemo(() => filterTeam(team, query), [team, query]);
  const { oldest, newest } = useMemo(() => teamExtremes(team), [team]);
  const me = team.find((member) => member.id === currentUserId);
  const suspendedCount = team.filter((member) => member.disabled === 1).length;

  function openInvite() {
    setName("");
    setEmail("");
    setError("");
    setNotice("");
    setActivationUrl("");
    setInvitePermissions(FULL);
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
    if (invitePermissions.length === 0) return setError("اختر صلاحية واحدة على الأقل للعضو الجديد.");
    setSaving(true);
    setError("");
    const result = await adminRequest<{ delivery?: { message?: string; activationUrl?: string } }>("/api/admin/team", { method: "POST", body: { name: name.trim(), email: email.trim(), permissions: invitePermissions } });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    setNotice(result.data?.delivery?.message || "تم إنشاء الحساب.");
    setActivationUrl(result.data?.delivery?.activationUrl || "");
    toast("success", "تمت إضافة العضو");
    router.refresh();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(activationUrl);
      toast("success", "تم نسخ رابط التفعيل");
    } catch {
      toast("error", "تعذر النسخ", "انسخ الرابط يدويًا من الحقل.");
    }
  }

  function openEdit(member: TeamRow) {
    setEditing(member);
    setEditPermissions((member.permissions as AdminPermission[] | undefined) ?? FULL);
    setEditError("");
  }

  const editDirty = editing ? JSON.stringify([...(editing.permissions ?? FULL)].sort()) !== JSON.stringify([...editPermissions].sort()) : false;

  async function savePermissions() {
    if (!editing || saving) return;
    if (editPermissions.length === 0) return setEditError("اختر صلاحية واحدة على الأقل، أو أزل العضو من الفريق.");
    setSaving(true);
    setEditError("");
    const result = await adminRequest(`/api/admin/team/${editing.id}/permissions`, { method: "PATCH", body: { permissions: editPermissions } });
    setSaving(false);
    if (!result.ok) return setEditError(result.error);
    toast("success", "تم تحديث الصلاحيات", editing.name);
    setEditing(null);
    router.refresh();
  }

  async function runAction(member: TeamRow, action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusyId(member.id);
    const result = await action();
    setBusyId("");
    if (!result.ok) return toast("error", "تعذر تنفيذ الإجراء", result.error);
    toast("success", success, member.name);
    router.refresh();
  }

  async function toggleSuspended(member: TeamRow) {
    const suspending = member.disabled !== 1;
    const ok = await confirm({
      title: suspending ? `إيقاف حساب «${member.name}»؟` : `إعادة تفعيل «${member.name}»؟`,
      description: suspending ? "سيُسجَّل خروجه من كل الأجهزة فورًا ولن يستطيع الدخول حتى تعيد تفعيله. لا يُحذف حسابه." : "سيستطيع الدخول من جديد بصلاحياته الحالية.",
      confirmLabel: suspending ? "إيقاف الحساب" : "إعادة التفعيل",
      tone: suspending ? "danger" : "default"
    });
    if (!ok) return;
    await runAction(member, () => adminRequest(`/api/admin/team/${member.id}/status`, { method: "PATCH", body: { disabled: suspending } }), suspending ? "تم إيقاف الحساب" : "تمت إعادة التفعيل");
  }

  async function revokeSessions(member: TeamRow) {
    const ok = await confirm({ title: `إنهاء جلسات «${member.name}»؟`, description: "سيُسجَّل خروجه من كل الأجهزة ويحتاج لتسجيل الدخول من جديد.", confirmLabel: "إنهاء الجلسات", tone: "danger" });
    if (!ok) return;
    await runAction(member, () => adminRequest(`/api/admin/team/${member.id}/sessions`, { method: "DELETE" }), "تم إنهاء الجلسات");
  }

  async function revoke(member: TeamRow) {
    const ok = await confirm({
      title: `إزالة «${member.name}» من الفريق؟`,
      description: "سيفقد العضو الوصول إلى لوحة الأدمن فورًا. لا يُحذف حسابه.",
      confirmLabel: "إزالة من الفريق",
      tone: "danger",
      requireText: "إزالة"
    });
    if (!ok) return;
    await runAction(member, () => adminRequest(`/api/admin/team/${member.id}`, { method: "DELETE" }), "تمت إزالة العضو");
  }

  return (
    <>
      <div className="ds-stat-grid">
        <StatCard label="إجمالي الأعضاء" value={formatNumber(team.length)} hint="يملكون صلاحية الوصول للوحة" icon="shield" />
        <StatCard label="حسابات موقوفة" value={formatNumber(suspendedCount)} hint={suspendedCount ? "لا يستطيعون الدخول" : "لا يوجد حسابات موقوفة"} icon="alert" tone={suspendedCount ? "warning" : "neutral"} />
        {oldest ? <StatCard label="أقدم عضو" value={oldest.name} hint={oldest.createdAt} icon="user" /> : null}
        {newest ? <StatCard label="أحدث عضو" value={newest.name} hint={newest.createdAt} icon="user" /> : null}
        <StatCard label="حسابك" value={me?.name || "—"} hint="أنت مسجّل دخول بهذا الحساب" icon="checkCircle" tone="success" />
      </div>

      <Section
        title={`فريق المنصة (${formatNumber(visible.length)} من ${formatNumber(team.length)})`}
        description="الأعضاء وصلاحياتهم. تُطبَّق الصلاحيات على الخادم، وإخفاء الأزرار في الواجهة ليس الحماية الوحيدة."
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
                  <th scope="col">الصلاحيات</th>
                  <th scope="col">آخر تسجيل دخول</th>
                  <th scope="col">الحالة</th>
                  <th scope="col"><span className="ds-sr-only">إجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((member) => {
                  const isSelf = member.id === currentUserId;
                  const permissions = (member.permissions as AdminPermission[] | undefined) ?? FULL;
                  const full = permissions.length === ADMIN_PERMISSIONS.length;
                  const lastLogin = member.lastLoginAt ? parseTimestamp(member.lastLoginAt) || Date.parse(member.lastLoginAt) : 0;
                  return (
                    <tr key={member.id}>
                      <td data-cell="main">
                        <div className="ds-cell-main">
                          <span className="ds-avatar" aria-hidden="true">{member.name.slice(0, 1) || "ع"}</span>
                          <div><strong>{member.name}</strong><span><bdi dir="ltr">{member.email}</bdi></span></div>
                        </div>
                      </td>
                      <td data-label="الصلاحيات">
                        {full ? <Badge tone="info">كل الصلاحيات</Badge> : (
                          <div className="ds-chip-row">{permissions.map((permission) => <Badge key={permission} tone="neutral" dot={false}>{PERMISSION_LABELS[permission].label}</Badge>)}</div>
                        )}
                      </td>
                      <td data-label="آخر تسجيل دخول"><span className="ds-cell-sub">{lastLogin ? relativeTime(lastLogin, generatedAt) : "لم يسجّل دخولًا بعد"}</span></td>
                      <td data-label="الحالة">
                        <div className="ds-chip-row">
                          {isSelf ? <Badge tone="info">أنت</Badge> : null}
                          <Badge tone={member.disabled === 1 ? "danger" : "success"}>{member.disabled === 1 ? "موقوف" : "نشط"}</Badge>
                        </div>
                      </td>
                      <td>
                        <div className="ds-cell-actions">
                          <ActionMenu
                            label={`إجراءات ${member.name}`}
                            items={[
                              { key: "edit", label: "تعديل الصلاحيات", icon: "shield", onSelect: () => openEdit(member) },
                              ...(isSelf ? [] : [
                                { key: "suspend", label: busyId === member.id ? "جارٍ التنفيذ…" : member.disabled === 1 ? "إعادة تفعيل الحساب" : "إيقاف الحساب", icon: (member.disabled === 1 ? "checkCircle" : "alert") as "checkCircle" | "alert", disabled: busyId === member.id, onSelect: () => void toggleSuspended(member) },
                                { key: "sessions", label: "إنهاء كل الجلسات", icon: "logout" as const, disabled: busyId === member.id, onSelect: () => void revokeSessions(member) },
                                { key: "remove", label: "إزالة من الفريق", icon: "trash" as const, tone: "danger" as const, disabled: busyId === member.id, onSelect: () => void revoke(member) }
                              ])
                            ]}
                          />
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
        size="lg"
        title={notice ? "تمت إضافة العضو" : "إضافة عضو لفريق المنصة"}
        description={notice ? undefined : "ينشئ حساب دخول حقيقيًا بصلاحية أدمن ويرسل رابط تفعيل إلى بريده."}
        footer={notice ? <Button variant="primary" onClick={closeInvite}>تم</Button> : <><Button variant="outline" onClick={closeInvite}>إلغاء</Button><Button variant="primary" type="submit" form="team-invite-form" loading={saving}>إضافة العضو</Button></>}
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
            <PermissionPicker value={invitePermissions} onChange={setInvitePermissions} />
            {error ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{error}</p> : null}
          </form>
        )}
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        beforeClose={() => !editDirty || window.confirm("لديك تعديلات غير محفوظة. هل تريد إغلاق النافذة وفقدانها؟")}
        size="lg"
        title={editing ? `صلاحيات «${editing.name}»` : ""}
        description="يسري التغيير فورًا ويُسجَّل في سجل التدقيق مع القيم قبل وبعد."
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button><Button variant="primary" loading={saving} disabled={!editDirty} onClick={() => void savePermissions()}>حفظ الصلاحيات</Button></>}
      >
        {editing ? (
          <div style={{ display: "grid", gap: 12 }}>
            <PermissionPicker value={editPermissions} onChange={(next) => { setEditPermissions(next); setEditError(""); }} />
            {editError ? <p className="ds-field-error" role="alert"><Icon name="alert" size={14} />{editError}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
