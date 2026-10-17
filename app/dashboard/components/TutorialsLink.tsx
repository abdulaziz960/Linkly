import Link from "next/link";
import "./tutorials-link.css";

export default function TutorialsLink({ language = "ar" }: { language?: "ar" | "en" }) {
  return <Link href="/dashboard/tutorials" className="tutorials-top-link" aria-label={language === "ar" ? "مركز الشروحات — فيديو وخطوات لكل ميزة" : "Tutorial center — videos and step-by-step guides"}>
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="6" stroke="currentColor" strokeWidth="1.8" /><path d="m10 8 6 4-6 4V8Z" fill="currentColor" /></svg>
    <span>{language === "ar" ? "الشروحات" : "Tutorials"}</span>
  </Link>;
}
