import { getDiscountCodes } from "../../../lib/promo-codes";
import { getActivePlans } from "../../../lib/plans";
import AdminPageHeader from "../AdminPageHeader";
import DiscountCodesView from "./DiscountCodesView";
import { guardPage } from "../guard";

export default async function AdminDiscountCodesPage() {
  const denied = await guardPage("billing");
  if (denied) return denied;
  const [discountCodes, plans] = await Promise.all([getDiscountCodes(), getActivePlans()]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["أكواد الخصم", "Discount Codes"]}
        title={["إدارة أكواد الخصم", "Manage Discount Codes"]}
        description={["أكواد خصم للمستخدمين الجدد على أول اشتراك مدفوع، مع تحديد الباقات وحدود الاستخدام.", "Discount codes for new users on their first paid subscription, with plan and usage restrictions."]}
      />
      <DiscountCodesView discountCodes={discountCodes} plans={plans} />
    </>
  );
}
