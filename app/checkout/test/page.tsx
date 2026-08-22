import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentUser } from "../../../lib/auth";
import TestCheckout from "./TestCheckout";
import "../../billing/billing.css";
export default async function TestCheckoutPage({ searchParams }: { searchParams: Promise<{ paymentId?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  const { paymentId = "" } = await searchParams;
  return <main className="test-checkout"><section><span className="test-badge">وضع الاختبار</span><Image src="/assets/audiencew-logo.png" alt="" width={64} height={64} /><h1>محاكاة صفحة الدفع</h1><p>هذه تجربة آمنة لمسار الشراء. لن تُطلب بيانات بطاقة ولن يتم خصم أي مبلغ.</p><TestCheckout paymentId={paymentId} /></section></main>;
}
