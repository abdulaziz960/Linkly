import { Suspense } from "react";
import Image from "next/image";
import ActivateForm from "./ActivateForm";
import "../login/login.css";

export const metadata = {
  title: "تفعيل الحساب | AudienceW"
};

export default function ActivatePage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-label="تفعيل حساب AudienceW">
        <div className="login-brand">
          <Image src="/assets/audiencew-logo.png" alt="" width={44} height={44} />
          <div>
            <span>AudienceW</span>
            <b>إنشاء كلمة سر لحساب الموظف</b>
          </div>
        </div>

        <div className="login-copy">
          <p>تفعيل الحساب</p>
        </div>

        <Suspense fallback={null}>
          <ActivateForm />
        </Suspense>
      </section>
    </main>
  );
}
