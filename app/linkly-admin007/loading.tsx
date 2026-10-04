import { Skeleton } from "./ds/primitives";

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="جارٍ تحميل الصفحة">
      <Skeleton width={110} height={12} />
      <div style={{ height: 10 }} />
      <Skeleton width={320} height={28} />
      <div style={{ height: 10 }} />
      <Skeleton width={"min(520px, 100%)"} height={14} />
      <div className="ds-stat-grid" style={{ marginTop: 28 }}>
        {Array.from({ length: 8 }, (_, index) => (
          <div className="ds-stat" key={index} aria-hidden="true">
            <Skeleton width="55%" height={13} />
            <Skeleton width="40%" height={28} />
            <Skeleton width="80%" height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}
