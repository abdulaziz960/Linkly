import NotificationsView from "./NotificationsView";

export default function AdminNotificationsPage() {
  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>الإشعارات</p>
          <h1>مركز الإشعارات</h1>
          <span>كل الأحداث المهمة في مكان واحد: عملاء جدد، مدفوعات، وتنبيهات تجديد. يتحدّث تلقائيًا مع صوت عند وصول شيء جديد.</span>
        </div>
      </header>
      <NotificationsView />
    </>
  );
}
