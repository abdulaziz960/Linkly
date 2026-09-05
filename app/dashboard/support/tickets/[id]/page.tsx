import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../../lib/auth";
import TicketThreadClient from "./TicketThreadClient";
import "../../support.css";

export const dynamic = "force-dynamic";

export const metadata = { title: { absolute: "تفاصيل التذكرة | Linkly" } };

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/dashboard/support/tickets/${id}`);

  return <TicketThreadClient ticketId={id} />;
}
