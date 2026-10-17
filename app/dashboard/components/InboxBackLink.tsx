import Link from "next/link";
import styles from "./inbox-back-link.module.css";

type Props = { language?: "ar" | "en"; className?: string };

export default function InboxBackLink({ language = "ar", className = "" }: Props) {
  return <Link href="/dashboard?view=inbox" className={`${styles.button} ${className}`}>
    <span>{language === "ar" ? "العودة للمحادثات" : "Back to conversations"}</span>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </Link>;
}
