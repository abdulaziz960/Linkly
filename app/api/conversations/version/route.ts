import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getCurrentUser } from "../../../../lib/auth";
import { getEmployeeForUser, getVisibleAssigneeNames } from "../../../../lib/permissions-server";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

/**
 * A small fingerprint of the inbox the signed-in user can see, for the dashboard's live refresh.
 *
 * The inbox itself (GET /api/conversations) is every conversation with every message - about 2 MB - and
 * building it just to answer "nothing changed" every few seconds, for every open tab, was most of the load
 * on the server and the database. This answers the same question from a handful of small queries that never
 * read message bodies: the conversations' own fields, and per-delivery-status message counts with the
 * newest message time (new messages, deletions, and sent -> delivered -> read changes all move it).
 *
 * The dashboard fetches the full inbox when this value changes (and at least every 30 seconds regardless,
 * which also covers the time-based fields such as the 24-hour window).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "غير مصرح" }, { status: 401 });

  const employee = await getEmployeeForUser(user);
  const assigneeNames = await getVisibleAssigneeNames(user, employee);
  const assignee = Array.isArray(assigneeNames) ? { in: assigneeNames } : assigneeNames;
  const conversationWhere = assignee ? { tenantId: user.tenantId, assignee } : { tenantId: user.tenantId };

  const [conversations, messageGroups, transcripts, tags] = await Promise.all([
    prisma.conversation.findMany({
      where: conversationWhere,
      select: { id: true, status: true, assignee: true, unread: true, windowExpired: true, lastActivityAt: true, lastMessage: true, rating: true, closedAt: true, pipelineStage: true, dealValue: true },
      orderBy: { id: "asc" }
    }),
    prisma.message.groupBy({
      by: ["deliveryStatus"],
      where: { conversation: conversationWhere },
      _count: { _all: true },
      _max: { createdAt: true }
    }),
    prisma.message.count({ where: { conversation: conversationWhere, transcript: { not: "" } } }),
    prisma.conversationTag.count({ where: { conversation: conversationWhere } })
  ]);

  const fingerprint = JSON.stringify([conversations, messageGroups.map((group) => [group.deliveryStatus, group._count._all, group._max.createdAt]).sort(), transcripts, tags]);
  const version = createHash("sha1").update(fingerprint).digest("base64url");
  return NextResponse.json({ ok: true, version }, { headers: { "Cache-Control": "private, no-store" } });
}
