import { getSubscriptions } from "../../lib/subscriptions";
import { EXTRA_USER_PRICE, formatNumber } from "./utils";

export default async function AdminOverviewPage() {
  const subscriptions = await getSubscriptions();

  const activeClients = subscriptions.filter((s) => s.status === "نشط").length;
  const trialClients = subscriptions.filter((s) => s.status === "تجربة").length;
  const monthlyRevenue = subscriptions.reduce((sum, s) => {
    if (s.status !== "نشط") return sum;
    const extra = Math.max(0, s.employeeCount - s.employeeLimit) * EXTRA_USER_PRICE;
    return sum + s.amount + extra;
  }, 0);
  const totalConversations = subscriptions.reduce((sum, s) => sum + s.conversationCount, 0);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>لوحة التحكم الأساسية</p>
          <h1>إدارة عملاء AudienceW من مكان واحد</h1>
          <span>نظرة عامة سريعة على كل الأرقام المهمة، وتفاصيل كل قسم في صفحته الخاصة من القائمة الجانبية.</span>
        </div>
      </header>

      <section className="admin-section">
        <div className="admin-metrics">
          <article>
            <span>إجمالي العملاء</span>
            <strong>{formatNumber(subscriptions.length)}</strong>
            <small>{formatNumber(activeClients)} نشط · {formatNumber(trialClients)} تجربة</small>
          </article>
          <article>
            <span>اشتراكات نشطة</span>
            <strong>{formatNumber(activeClients)}</strong>
            <small>{formatNumber(subscriptions.length - activeClients)} غير نشطة</small>
          </article>
          <article>
            <span>إيراد شهري متوقع</span>
            <strong>{formatNumber(monthlyRevenue)}</strong>
            <small>ريال من الاشتراكات النشطة</small>
          </article>
          <article>
            <span>محادثات تحت الإدارة</span>
            <strong>{formatNumber(totalConversations)}</strong>
            <small>مجمعة من كل حسابات العملاء</small>
          </article>
        </div>
      </section>
    </>
  );
}
