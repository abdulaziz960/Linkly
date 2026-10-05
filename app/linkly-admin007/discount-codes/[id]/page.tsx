import { notFound } from "next/navigation";
import { getDiscountCodeById, getDiscountCodeUsageStats } from "../../../../lib/promo-codes";
import AdminPageHeader from "../../AdminPageHeader";
import DiscountCodeDetailView from "./DiscountCodeDetailView";
import { guardPage } from "../../guard";

export default async function AdminDiscountCodeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardPage("billing");
  if (denied) return denied;
  const { id } = await params;
  const discountCode = await getDiscountCodeById(id);
  if (!discountCode) notFound();

  const stats = await getDiscountCodeUsageStats(id);

  return (
    <>
      <AdminPageHeader
        eyebrow={["أكواد الخصم", "Discount Codes"]}
        title={[discountCode.code, discountCode.code]}
        description={[discountCode.name, discountCode.name]}
      />
      <DiscountCodeDetailView discountCode={discountCode} stats={stats} />
    </>
  );
}
