import SignupPageClient from "./SignupPageClient";
import { getActivePlans } from "../../lib/plans";
import "./signup.css";

export const metadata = { title: { absolute: "ابدأ تجربتك | Linkly" } };

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; billing?: string }> }) {
  const { plan: planId, billing } = await searchParams;
  const selectedPlan = planId
    ? (await getActivePlans()).find((plan) => plan.id === planId)
    : undefined;
  return <SignupPageClient selectedPlan={selectedPlan ? { id: selectedPlan.id, name: selectedPlan.name } : null} selectedBilling={billing === "yearly" ? "yearly" : "monthly"} />;
}
