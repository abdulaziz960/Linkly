import Image from "next/image";
import Link from "next/link";
import logo from "../public/assets/linkly-logo.png";
import s from "./page.module.css";

const copy = {
  ar: {
    about: "لنكلي منصة سعودية تجمع محادثات عملائك من واتساب وإنستغرام والبريد وتيليجرام وغيرها في صندوق وارد واحد، وتوزّعها على فريقك، وتصعّد المحادثات المتأخرة تلقائيًا، وترد عنك آليًا، وتدير حملاتك ومنتجاتك وفروعك وتقاريرك من مكان واحد.",
    product: "المنتج", features: "المميزات", how: "طريقة العمل", pricing: "الأسعار", faq: "الأسئلة الشائعة", blog: "المدونة",
    company: "الشركة", privacy: "الخصوصية", terms: "شروط الاستخدام", deletion: "حذف البيانات", contact: "تواصل معنا",
    rights: "جميع الحقوق محفوظة لشركة الجمهور المخصص للدعاية والإعلان.　 Linkly © 2026"
  },
  en: {
    about: "Linkly is a Saudi platform that brings your customers' WhatsApp, Instagram, email, Telegram and other conversations into one inbox, routes them to your team, escalates late conversations automatically, replies for you, and manages your campaigns, products, branches and reports from one place.",
    product: "Product", features: "Features", how: "How it works", pricing: "Pricing", faq: "FAQ", blog: "Blog",
    company: "Company", privacy: "Privacy", terms: "Terms of use", deletion: "Data deletion", contact: "Contact us",
    rights: "All rights reserved to Al-Jomhor Al-Mokhassas for Advertising and Marketing.　 Linkly © 2026"
  }
} as const;

/** The landing page's footer for pages outside it (anchors point back to the landing page). */
export default function SiteFooter({ lang = "ar" }: { lang?: "ar" | "en" }) {
  const text = copy[lang];
  const home = lang === "en" ? "/en" : "/";
  const prefix = (path: string) => (lang === "en" ? `/en${path}` : path);
  return (
    <footer className={s.footer}>
      <div>
        <section>
          <Link className={s.brand} href={home}><Image src={logo} alt="" width={56} height={31} /><span>Linkly</span></Link>
          <p>{text.about}</p>
        </section>
        <nav>
          <b>{text.product}</b>
          <a href={`${home}#features`}>{text.features}</a>
          <a href={`${home}#how`}>{text.how}</a>
          <a href={`${home}#pricing`}>{text.pricing}</a>
          <Link href={prefix("/faq")}>{text.faq}</Link>
          <Link href={prefix("/blog")}>{text.blog}</Link>
        </nav>
        <nav>
          <b>{text.company}</b>
          <Link href={prefix("/privacy")}>{text.privacy}</Link>
          <Link href={prefix("/terms")}>{text.terms}</Link>
          <Link href={prefix("/data-deletion")}>{text.deletion}</Link>
          <Link href={prefix("/contact")}>{text.contact}</Link>
        </nav>
      </div>
      <small>{text.rights}</small>
    </footer>
  );
}
