import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getIntegrationSettings } from "../../../../lib/database";

// Deliberately open to any logged-in employee (not gated behind the
// "settings" permission like /api/settings/integration) - a payment issue
// blocks every WhatsApp message for the whole account, so any agent working
// the inbox should see the warning, not just whoever manages integrations.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ hasIssue: false }, { status: 401 });

  const settings = await getIntegrationSettings("whatsapp", user.tenantId);
  return NextResponse.json({ hasIssue: Boolean(settings.whatsappPaymentIssueAt) });
}
