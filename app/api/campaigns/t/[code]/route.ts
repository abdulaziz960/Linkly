import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { ensureSchema } from "../../../../../lib/database";
import { getAppOrigin } from "../../../../../lib/app-url";

type RouteContext = { params: Promise<{ code: string }> };

export const runtime = "nodejs";

/**
 * Public per-recipient tracking link embedded in a campaign message's body
 * placeholder (see lib/campaign-engine.ts) when the campaign has link
 * tracking enabled. No auth - anyone with the code can trigger a redirect,
 * same trust model as any other click-tracking link. Always redirects
 * somewhere sensible even for an unknown/expired code, so a stale or
 * tampered link never dead-ends the customer.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  await ensureSchema();
  const { code } = await context.params;
  const fallbackUrl = getAppOrigin(request);

  const recipient = code
    ? await prisma.campaignRecipient.findFirst({ where: { trackingCode: code } })
    : null;

  if (!recipient) {
    return NextResponse.redirect(fallbackUrl);
  }

  const clickedAt = new Date().toISOString();
  await prisma.$transaction([
    prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        clickedAt: recipient.clickedAt || clickedAt,
        clickCount: { increment: 1 }
      }
    }),
    // Individual click log, alongside the summary fields above - lets the
    // campaign report show exactly when each click happened, not just the
    // first click time and a running total.
    prisma.campaignRecipientClick.create({
      data: {
        id: `click-${randomUUID()}`,
        recipientId: recipient.id,
        tenantId: recipient.tenantId,
        clickedAt
      }
    })
  ]);

  const campaign = await prisma.campaign.findUnique({ where: { id: recipient.campaignId } });
  const destination = campaign?.destinationUrl.trim();

  return NextResponse.redirect(destination || fallbackUrl);
}
