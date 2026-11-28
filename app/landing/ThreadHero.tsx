import s from "../page.module.css";
import { ChannelGlyph, type Lang } from "./channelData";

// Illustrative exchange only - the customer, order and agent are fictional.
const copy = {
  ar: {
    label: "مثال لمحادثة عميل على واتساب",
    customer: "السلام عليكم، طلبي رقم 4812 متى يوصل؟",
    reply: "وعليكم السلام! طلع مع المندوب اليوم، ويوصلك قبل المغرب.",
    assigned: "أُسندت إلى نورة",
    time: "رُد خلال 40 ثانية",
    queue: "محادثات جديدة من إنستقرام بانتظار الإسناد"
  },
  en: {
    label: "Example customer conversation on WhatsApp",
    customer: "Hi, when will order 4812 arrive?",
    reply: "Hi! It left with the courier today, you'll have it by this evening.",
    assigned: "Assigned to Noura",
    time: "Answered in 40 seconds",
    queue: "new Instagram conversations waiting to be assigned"
  }
};

export default function ThreadHero({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return (
    <figure className={s.thread} aria-label={t.label}>
      <p className={s.msgIn}>{t.customer}</p>
      <span className={s.typing} aria-hidden="true"><span /><span /><span /></span>
      <p className={s.msgOut}>{t.reply}</p>
      <figcaption className={s.receipt}>
        <span><ChannelGlyph channel="whatsapp" className={s.receiptIcon} />{t.assigned}</span>
        <span>{t.time}</span>
      </figcaption>
      <p className={s.queue}><b>3</b>{t.queue}</p>
    </figure>
  );
}
