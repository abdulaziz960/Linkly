"use client";

import { useCallback, useEffect, useState } from "react";
import type { CardPayment, ClientCards, RemovedCard } from "../../../../lib/admin-client-cards";
import { formatNumber } from "../../utils";
import { useConfirm } from "../../ds/Dialog";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "../../ds/primitives";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";
import Icon from "../../ds/Icon";
import { PAYMENT_TONE } from "./profile-data";

const BRANDS: Record<string, string> = { mada: "مدى", visa: "Visa", master: "Mastercard", mastercard: "Mastercard", amex: "American Express" };
const brandName = (brand: string) => BRANDS[brand.trim().toLowerCase()] ?? (brand || "بطاقة");
const day = (value: string) => value.slice(0, 10);
const Digits = ({ last4 }: { last4: string }) => <bdi dir="ltr">•••• {last4 || "----"}</bdi>;

function cardCell(payment: CardPayment) {
  if (payment.lookup === "found") return <>{brandName(payment.brand)} <Digits last4={payment.last4} /></>;
  return <span className="ds-cell-sub">{payment.lookup === "none" ? "دفع بدون بطاقة" : "تعذر جلب البطاقة من ميسر"}</span>;
}

export default function ClientCardsPanel({ tenantId, companyName }: { tenantId: string; companyName: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<ClientCards | null>(null);
  const [loadError, setLoadError] = useState("");
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    setData(null);
    const response = await adminRequest<ClientCards>(`/api/admin/clients/${encodeURIComponent(tenantId)}/cards`);
    if (!response.ok) { setLoadError(response.error); return; }
    setData(response.data);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function removeCard() {
    const ok = await confirm({
      title: "حذف البطاقة المحفوظة",
      description: `ستُحذف البطاقة المحفوظة لـ «${companyName}» من Linkly ومن ميسر، ويتوقف التجديد التلقائي. لا يمكن استرجاعها، وإعادتها تحتاج دفعة جديدة من العميل نفسه. يُسجَّل الإجراء في سجل التدقيق.`,
      confirmLabel: "حذف البطاقة",
      tone: "danger"
    });
    if (!ok) return;
    setRemoving(true);
    const response = await adminRequest<{ gateway: RemovedCard["gateway"] }>(`/api/admin/clients/${encodeURIComponent(tenantId)}/cards`, { method: "DELETE" });
    setRemoving(false);
    if (!response.ok) { toast("error", "تعذر حذف البطاقة", response.error); return; }
    if (response.data.gateway === "deleted") toast("success", "تم حذف البطاقة من Linkly ومن ميسر وإيقاف التجديد التلقائي");
    else if (response.data.gateway === "failed") toast("error", "أُوقف التجديد، لكن تعذر حذف البطاقة من ميسر", "لن يُسحب منها شيء. أعد المحاولة بعد قليل لحذفها من ميسر.");
    else toast("success", "حُذفت البطاقة من Linkly وأُوقف التجديد", "لم يتوفر رمز صالح لحذفها من ميسر؛ تحقق من لوحة ميسر إذا لزم.");
    await load();
  }

  if (loadError) return <ErrorState title="تعذر تحميل البطاقات" description={loadError} onRetry={load} />;
  if (!data) return <div className="ds-card ds-card-pad" aria-busy="true"><Skeleton width="60%" height={14} /><div style={{ height: 10 }} /><Skeleton width="85%" height={14} /></div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p className="ds-note" style={{ margin: 0 }}><Icon name="shield" size={16} /><span>يظهر نوع البطاقة وآخر 4 أرقام فقط. لا تُحفظ أرقام البطاقات في Linkly، ولا يمكن إضافة بطاقة من لوحة الإدارة.</span></p>

      <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 10 }}>
        <strong>البطاقة المحفوظة للتجديد التلقائي</strong>
        {data.saved ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Icon name="card" size={18} />
              <span>{brandName(data.saved.brand)} <Digits last4={data.saved.last4} /></span>
              <Badge tone={data.saved.autoRenewEnabled ? "success" : "neutral"}>{data.saved.autoRenewEnabled ? "التجديد التلقائي مفعّل" : "التجديد التلقائي متوقف"}</Badge>
              {data.saved.failCount ? <Badge tone="warning">محاولات فاشلة: {formatNumber(data.saved.failCount)}</Badge> : null}
            </div>
            <Button variant="outline" icon="trash" loading={removing} onClick={removeCard}>حذف البطاقة وإيقاف التجديد</Button>
          </div>
        ) : <span className="ds-cell-sub">لا توجد بطاقة محفوظة.</span>}
      </div>

      {data.payments.length === 0 ? (
        <EmptyState icon="card" title="لا توجد دفعات ببطاقة" description="تظهر هنا البطاقات بعد أن يدفع العميل عبر ميسر." />
      ) : (
        <>
          {data.cards.length ? (
            <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 10 }}>
              <strong>البطاقات المستخدمة في الدفع</strong>
              <div className="ds-table-wrap">
                <table className="ds-table">
                  <thead><tr><th scope="col">البطاقة</th><th scope="col">دفعات ناجحة</th><th scope="col">المبلغ المحصّل</th><th scope="col">آخر استخدام</th></tr></thead>
                  <tbody>
                    {data.cards.map((card) => (
                      <tr key={`${card.brand}-${card.last4}`}>
                        <td>{brandName(card.brand)} <Digits last4={card.last4} /> {card.saved ? <Badge tone="success">المحفوظة</Badge> : null}</td>
                        <td>{formatNumber(card.paidCount)} من {formatNumber(card.payments)}</td>
                        <td>{formatNumber(card.paidAmount)} ر.س</td>
                        <td><bdi dir="ltr">{day(card.lastUsed)}</bdi></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="ds-card ds-card-pad" style={{ display: "grid", gap: 10 }}>
            <strong>سجل الدفعات</strong>
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead><tr><th scope="col">التاريخ</th><th scope="col">النوع</th><th scope="col">المبلغ</th><th scope="col">الحالة</th><th scope="col">البطاقة</th></tr></thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td><bdi dir="ltr">{day(payment.date)}</bdi></td>
                      <td>{payment.source === "subscription" ? "اشتراك" : "رصيد حملات"}</td>
                      <td>{formatNumber(payment.amount)} ر.س</td>
                      <td><Badge tone={PAYMENT_TONE[payment.status] ?? "neutral"}>{payment.status}</Badge></td>
                      <td>{cardCell(payment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.truncated ? <span className="ds-cell-sub">تُعرض أحدث الدفعات فقط.</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
