"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="admin-error" dir="rtl" role="alert">
      <h1>تعذر تحميل لوحة التحكم</h1>
      <p>لم نتمكن من جلب البيانات الآن. تحقق من اتصالك ثم حاول مجددًا.</p>
      <button type="button" onClick={reset}>إعادة المحاولة</button>
    </main>
  );
}
