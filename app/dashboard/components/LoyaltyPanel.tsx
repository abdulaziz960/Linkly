"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import CustomSelect from "../../components/CustomSelect";

type Settings = { enabled: boolean; goal: number; rewardKind: "percent" | "fixed" | "free_product"; rewardValue: number; productId: string; validDays: number; notifyProgress: boolean; progressText: string; rewardText: string };
type Customer = { phone: string; ordersInCycle: number; totalOrders: number; rewardsGiven: number; updatedAt: string };
type Reward = { phone: string; code: string; description: string; expiresAt: string; createdAt: string };
type Product = { id: string; name: string; price: number };

/** Loyalty for sales made in WhatsApp: after N paid orders the customer gets a personal discount code or a free product. */
export default function LoyaltyPanel() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/catalog/loyalty", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; data?: { settings: Settings; customers: Customer[]; rewards: Reward[]; products: Product[] } } | null;
      if (response.ok && result?.ok && result.data) {
        setSettings(result.data.settings);
        setCustomers(result.data.customers);
        setRewards(result.data.rewards);
        setProducts(result.data.products);
      }
    } catch {
      // The panel stays empty.
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/catalog/loyalty", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: Settings } | null;
      if (!response.ok || !result?.ok) {
        setNote({ ok: false, text: result?.error || t("تعذر الحفظ", "Could not save") });
        return;
      }
      if (result.data) setSettings(result.data);
      setNote({ ok: true, text: t("تم حفظ برنامج الولاء.", "Loyalty program saved.") });
    } catch {
      setNote({ ok: false, text: t("تعذر الاتصال بالخادم", "Could not reach the server") });
    } finally {
      setBusy(false);
    }
  }

  async function resetCycle(phone: string) {
    await fetch("/api/catalog/loyalty", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) }).catch(() => null);
    await load();
  }

  if (!settings) return null;
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  return (
    <section className="loyalty-panel">
      <div className="loyalty-card">
        <h3>{t("برنامج الولاء", "Loyalty program")}</h3>
        <p className="muted-copy">{t("يخص الطلبات التي يشتريها العميل ويدفعها مباشرة داخل واتساب (الكتالوج ورابط الدفع). طلبات سلة وزد وشوبيفاي لا تُحتسب.", "For orders bought and paid directly inside WhatsApp (the catalog and payment link). Salla, Zid and Shopify orders do not count.")}</p>
        <label className="loyalty-check">
          <input type="checkbox" checked={settings.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
          {t("تفعيل برنامج الولاء", "Turn the loyalty program on")}
        </label>
        <div className="loyalty-grid">
          <label>{t("عدد الطلبات المدفوعة للحصول على المكافأة", "Paid orders needed for the reward")}
            <input type="number" min={1} max={50} dir="ltr" value={settings.goal} onChange={(event) => set({ goal: Number(event.target.value) || 1 })} />
          </label>
          <label>{t("نوع المكافأة", "Reward")}
            <CustomSelect value={settings.rewardKind} onChange={(value) => set({ rewardKind: value as Settings["rewardKind"] })} options={[{ value: "percent", label: t("كود خصم بنسبة %", "Percentage discount code") }, { value: "fixed", label: t("كود خصم بمبلغ ثابت", "Fixed-amount discount code") }, { value: "free_product", label: t("منتج مجاني", "Free product") }]} />
          </label>
          {settings.rewardKind === "free_product" ? (
            <>
              <label>{t("المنتج المجاني", "Free product")}
                <CustomSelect value={settings.productId} onChange={(value) => set({ productId: value })} options={[{ value: "", label: t("أي منتج يختاره العميل", "Any product the customer chooses") }, ...products.map((product) => ({ value: product.id, label: `${product.name} (${product.price})` }))]} />
              </label>
              {!settings.productId ? (
                <label>{t("أقصى سعر للمنتج المجاني (0 = بلا حد)", "Highest price of the free item (0 = no limit)")}
                  <input type="number" min={0} dir="ltr" value={settings.rewardValue} onChange={(event) => set({ rewardValue: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
              ) : null}
            </>
          ) : (
            <label>{settings.rewardKind === "percent" ? t("نسبة الخصم (حتى 90%)", "Discount percent (up to 90%)") : t("مبلغ الخصم (ر.س)", "Discount amount (SAR)")}
              <input type="number" min={1} dir="ltr" value={settings.rewardValue} onChange={(event) => set({ rewardValue: Number(event.target.value) || 1 })} />
            </label>
          )}
          <label>{t("صلاحية الكود (أيام)", "Code validity (days)")}
            <input type="number" min={1} max={365} dir="ltr" value={settings.validDays} onChange={(event) => set({ validDays: Number(event.target.value) || 1 })} />
          </label>
        </div>
        {settings.rewardKind === "free_product" ? <p className="muted-copy">{settings.productId
          ? t("المنتج المجاني يُمنح ككود بقيمة سعر المنتج. أقل مبلغ يدفعه العميل ريال واحد لأن بوابة الدفع لا تقبل دفعة صفر.", "The free product is given as a code worth the product's price. The customer pays at least 1 SAR because the payment gateway does not accept a zero payment.")
          : t("«أي منتج»: يضع العميل ما يريد في السلة ويطبّق الكود فيصير **أغلى منتج (قطعة واحدة)** في السلة مجانيًا، بحد أقصى للسعر إن حددته. أقل مبلغ يدفعه العميل ريال واحد.", "“Any product”: the customer fills the cart and applies the code, and the dearest single item in the cart is free, up to the price limit if you set one. The customer pays at least 1 SAR.")}</p> : null}
        <label className="loyalty-check">
          <input type="checkbox" checked={settings.notifyProgress} onChange={(event) => set({ notifyProgress: event.target.checked })} />
          {t("أرسل للعميل إشعار تقدّمه بعد كل طلب مدفوع", "Tell the customer their progress after every paid order")}
        </label>
        <label>{t("رسالة التقدّم", "Progress message")}
          <textarea value={settings.progressText} onChange={(event) => set({ progressText: event.target.value })} />
        </label>
        <label>{t("رسالة المكافأة", "Reward message")}
          <textarea value={settings.rewardText} onChange={(event) => set({ rewardText: event.target.value })} />
        </label>
        <small className="muted-copy">{t("المتغيرات: {name} الاسم، {done} المكتمل، {goal} الهدف، {left} المتبقي، {reward} المكافأة، {code} الكود، {date} تاريخ الانتهاء.", "Variables: {name}, {done}, {goal}, {left}, {reward}, {code}, {date}.")}</small>
        {note ? <span className={note.ok ? "store-order-ok" : "store-orders-error"}>{note.text}</span> : null}
        <div className="store-order-actions">
          <button type="button" className="primary-action" disabled={busy} onClick={() => void save()}>{busy ? t("جارٍ الحفظ...", "Saving...") : t("حفظ", "Save")}</button>
        </div>
      </div>

      <div className="loyalty-card">
        <h3>{t("عملاء الولاء", "Loyalty customers")}</h3>
        {customers.length ? (
          <div className="loyalty-table">
            {customers.map((customer) => (
              <div key={customer.phone}>
                <b dir="ltr">{customer.phone}</b>
                <span>{customer.ordersInCycle} / {settings.goal}</span>
                <small>{t(`إجمالي ${customer.totalOrders} · مكافآت ${customer.rewardsGiven}`, `${customer.totalOrders} total · ${customer.rewardsGiven} rewards`)}</small>
                <button type="button" className="soft-action" onClick={() => void resetCycle(customer.phone)}>{t("تصفير", "Reset")}</button>
              </div>
            ))}
          </div>
        ) : <p className="muted-copy">{t("لا يوجد عملاء بعد. يظهر العميل هنا بعد أول طلب مدفوع بعد تفعيل البرنامج.", "No customers yet. A customer appears after the first paid order once the program is on.")}</p>}
      </div>

      <div className="loyalty-card">
        <h3>{t("المكافآت الممنوحة", "Rewards given")}</h3>
        {rewards.length ? (
          <div className="loyalty-table">
            {rewards.map((reward) => (
              <div key={reward.code}>
                <b dir="ltr">{reward.code}</b>
                <span>{reward.description}</span>
                <small dir="ltr">{reward.phone} · {reward.expiresAt}</small>
              </div>
            ))}
          </div>
        ) : <p className="muted-copy">{t("لم تُمنح مكافآت بعد.", "No rewards given yet.")}</p>}
      </div>
    </section>
  );
}
