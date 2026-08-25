import type { Metadata } from "next";
import Link from "next/link";
import "../legal.css";

export const metadata: Metadata = {
  title: "Terms of Service | Linkly",
  description: "Linkly terms of service"
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <section className="legal-shell">
        <Link className="legal-brand" href="/">
          <span className="legal-logo">A</span>
          Linkly
        </Link>
        <h1>شروط الاستخدام</h1>
        <p className="legal-updated">آخر تحديث: 27 يوليو 2026</p>

        <p>
          باستخدامك لمنصة Linkly فإنك توافق على هذه الشروط. المنصة مخصصة لإدارة تواصل العملاء عبر القنوات الرقمية
          المرتبطة بحسابك وبناءً على الصلاحيات التي تمنحها أنت أو شركتك.
        </p>

        <h2>استخدام الخدمة</h2>
        <ul>
          <li>يجب استخدام المنصة بما يتوافق مع الأنظمة المحلية وسياسات المنصات المرتبطة مثل Meta وGoogle وTelegram.</li>
          <li>أنت مسؤول عن صحة بيانات الربط والصلاحيات التي تمنحها للمنصة.</li>
          <li>يجب عدم استخدام المنصة لإرسال رسائل مزعجة أو مخالفة أو غير مصرح بها.</li>
        </ul>

        <h2>القنوات والربط</h2>
        <p>
          تعتمد بعض الميزات على موافقات خارجية من مزودي القنوات مثل Meta وGoogle. قد تتغير الصلاحيات أو القيود أو
          نوافذ الإرسال حسب سياسات تلك المنصات، وقد يتطلب ذلك تحديث الإعدادات أو الحصول على موافقات إضافية.
        </p>

        <h2>حسابات المستخدمين</h2>
        <p>
          يجب الحفاظ على سرية بيانات الدخول. يمكن لمالك الحساب أو المسؤول إدارة الموظفين والصلاحيات وحدود الاستخدام
          حسب الباقة والإعدادات المتاحة.
        </p>

        <h2>البيانات والمحتوى</h2>
        <p>
          يحتفظ العميل بملكية بياناته ومحتوى محادثاته. تستخدم Linkly هذه البيانات فقط لتقديم الخدمة وتشغيل الميزات
          المطلوبة داخل المنصة.
        </p>

        <h2>تغييرات الخدمة</h2>
        <p>
          قد نقوم بتحديث الميزات أو الشروط أو آلية الربط لتحسين الخدمة أو الالتزام بتغييرات المنصات الخارجية. سيتم
          تحديث تاريخ هذه الصفحة عند إجراء تغييرات جوهرية.
        </p>

        <h2>التواصل</h2>
        <div className="legal-contact">
          <p>للاستفسارات حول الشروط يمكن التواصل معنا عبر البريد: marketing@audience.sa</p>
        </div>

        <nav className="legal-links">
          <Link href="/privacy">سياسة الخصوصية</Link>
          <Link href="/data-deletion">حذف البيانات</Link>
          <Link href="/">الصفحة الرئيسية</Link>
          <Link href="/en/terms">English</Link>
        </nav>
      </section>
    </main>
  );
}
