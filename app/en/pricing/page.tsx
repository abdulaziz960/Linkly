import PricingPage, { pricingMetadata } from "../../PricingPage";
import { applyPageSeo } from "../../../lib/page-seo";

// Prices come from the database (an admin's edit shows up at once), so this is read on each request, never at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return applyPageSeo("/en/pricing", await pricingMetadata("en"));
}

export default function Page() {
  return <PricingPage lang="en" />;
}
