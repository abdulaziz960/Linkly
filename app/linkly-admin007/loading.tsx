export default function AdminLoading() {
  return (
    <div className="admin-loading" dir="rtl" aria-busy="true" aria-label="جارٍ تحميل لوحة التحكم">
      <div className="admin-skeleton admin-skeleton-heading" />
      <div className="admin-skeleton admin-skeleton-description" />
      <div className="admin-loading-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="admin-skeleton admin-skeleton-card" key={index} />)}
      </div>
    </div>
  );
}
