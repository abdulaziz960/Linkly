import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = {
  title: { absolute: "Data Deletion | Linkly" },
  description: "Linkly data deletion instructions"
};

export default function DataDeletionPage() {
  return (
    <main className="legal-page">
      <section className="legal-shell">
        <Link className="legal-brand" href="/">
          <span className="legal-logo" aria-hidden="true" />
          Linkly
        </Link>
        <h1>تعليمات حذف البيانات</h1>
        <p className="legal-updated">آخر تحديث: 27 يوليو 2026</p>

        <p>
          يمكن لمستخدمي Linkly ومالكي الحسابات طلب حذف بياناتهم أو فصل القنوات المرتبطة في أي وقت. تشمل البيانات
          القابلة للحذف بيانات الحساب، المحادثات، العملاء، الموظفين، الوسوم، إعدادات الربط، والتوكنات المحفوظة.
        </p>

        <h2>طريقة طلب حذف البيانات</h2>
        <ol>
          <li>سجل الدخول إلى حسابك في Linkly.</li>
          <li>اذهب إلى الإعدادات والربط وافصل القنوات التي لا ترغب بالاحتفاظ بها.</li>
          <li>لحذف كامل بيانات الحساب، أرسل طلب حذف إلى البريد: marketing@audience.sa.</li>
          <li>اكتب في عنوان الرسالة: Data Deletion Request.</li>
          <li>اذكر اسم الشركة، البريد المسجل، والقنوات المطلوب حذف بياناتها.</li>
        </ol>

        <h2>حذف بيانات Meta</h2>
        <p>
          عند طلب حذف بيانات Meta أو فصل الربط، سنحذف رموز الوصول وبيانات الربط المخزنة الخاصة بالقناة، وسنتوقف عن
          استقبال أو إرسال الرسائل عبر تلك القناة. يمكن أيضاً إزالة التطبيق من إعدادات حساب Meta Business الخاص بك.
        </p>

        <h2>مدة المعالجة</h2>
        <p>
          نعالج طلبات حذف البيانات خلال مدة معقولة، وقد نحتفظ ببعض السجلات المحدودة إذا كان ذلك مطلوباً للالتزام
          القانوني أو منع إساءة الاستخدام أو حل النزاعات.
        </p>

        <h2>التواصل</h2>
        <div className="legal-contact">
          <p>لطلب حذف البيانات: marketing@audience.sa</p>
        </div>

        <nav className="legal-links">
          <Link href="/privacy">سياسة الخصوصية</Link>
          <Link href="/terms">شروط الاستخدام</Link>
          <Link href="/">الصفحة الرئيسية</Link>
          <Link href="/en/data-deletion">English</Link>
        </nav>
      </section>
    </main>
  );
}
