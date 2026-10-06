import { NextRequest } from "next/server";
import { getAdminPermissions, requirePlatformAdmin } from "../../../../lib/admin-auth";
import { getSubscriptionPayments } from "../../../../lib/subscriptions";
import { getVisibleSubscriptions } from "../../../../lib/admin-hidden-clients";
import { jsonError, jsonOk } from "../../_utils/json";

export const runtime = "nodejs";

const LIMIT = 5;

export type AdminSearchResults = {
  clients: { id: string; title: string; subtitle: string; href: string }[];
  payments: { id: string; title: string; subtitle: string; href: string }[];
};

function normalise(value: string) {
  return value.toLocaleLowerCase("ar").normalize("NFKC");
}

// Global admin search across clients and payments. Filtering happens in memory
// on the already-loaded lists so it behaves the same on SQLite and Postgres
// (Prisma's case-insensitive `contains` differs between them).
export async function GET(request: NextRequest) {
  const admin = await requirePlatformAdmin();
  if (!admin) return jsonError("لا تملك صلاحية الوصول", 403);

  const query = normalise(new URL(request.url).searchParams.get("q")?.trim() ?? "");
  if (query.length < 2) return jsonOk<AdminSearchResults>({ clients: [], payments: [] });

  // Each group is searched only when the member may see it.
  const permissions = await getAdminPermissions(admin.id);
  const [subscriptions, payments] = await Promise.all([
    permissions.includes("clients") ? getVisibleSubscriptions() : Promise.resolve([]),
    permissions.includes("billing") ? getSubscriptionPayments() : Promise.resolve([])
  ]);

  const clients = subscriptions
    .filter((subscription) => normalise(`${subscription.companyName} ${subscription.ownerName} ${subscription.ownerEmail} ${subscription.tenantId}`).includes(query))
    .slice(0, LIMIT)
    .map((subscription) => ({
      id: subscription.tenantId,
      title: subscription.companyName,
      subtitle: `${subscription.ownerName} · ${subscription.ownerEmail}`,
      href: `/linkly-admin007/clients/${encodeURIComponent(subscription.tenantId)}`
    }));

  const matchedPayments = payments
    .filter((payment) => normalise(`${payment.companyName} ${payment.id} ${payment.moyasarId} ${payment.gatewayPaymentId ?? ""}`).includes(query))
    .slice(0, LIMIT)
    .map((payment) => ({
      id: payment.id,
      title: `${payment.companyName} · ${payment.amount}`,
      subtitle: `${payment.status} · ${payment.gatewayPaymentId || payment.moyasarId || payment.id}`,
      href: `/linkly-admin007/payments?q=${encodeURIComponent(payment.gatewayPaymentId || payment.moyasarId || payment.id)}`
    }));

  return jsonOk<AdminSearchResults>({ clients, payments: matchedPayments });
}
