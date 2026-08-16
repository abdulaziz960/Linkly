import { NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../../lib/database";
import { getCurrentUser } from "../../../../../lib/auth";
import { fetchGoogleWithAutoRefresh, normalizeGoogleResourceId } from "../../../../../lib/google-business";
import { storeGoogleMapsReview } from "../../../../../lib/google-maps-inbox";

type GoogleReview = {
  reviewId?: string;
  name?: string;
  reviewer?: {
    displayName?: string;
  };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: {
    comment?: string;
  };
};

const ratingMap: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5
};

async function syncReviews() {
  const user = await getCurrentUser();
  const settings = await getIntegrationSettings("google_maps", user?.tenantId);
  const accountId = normalizeGoogleResourceId(settings.googleAccountId);
  const locationId = normalizeGoogleResourceId(settings.googleLocationId);

  if (!settings.accessToken.trim() || !accountId || !locationId) {
    return NextResponse.json({ ok: false, error: "ربط خرائط Google غير مكتمل" }, { status: 400 });
  }

  const response = await fetchGoogleWithAutoRefresh(settings, `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews?pageSize=50`);
  const payload = await response.json().catch(() => null) as { reviews?: GoogleReview[]; error?: { message?: string } } | null;

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: payload?.error?.message || "تعذر جلب تقييمات Google" }, { status: 400 });
  }

  const reviews = payload?.reviews || [];
  for (const review of reviews) {
    const reviewId = review.reviewId || review.name?.split("/").pop() || "";
    if (!reviewId) continue;

    await storeGoogleMapsReview({
      tenantId: user?.tenantId,
      reviewId,
      reviewerName: review.reviewer?.displayName,
      rating: review.starRating ? ratingMap[review.starRating] : undefined,
      comment: review.comment,
      receivedAt: new Date(review.updateTime || review.createTime || Date.now()),
      locationName: settings.wabaName || "خرائط Google",
      existingReply: review.reviewReply?.comment
    });
  }

  return NextResponse.json({ ok: true, synced: reviews.length });
}

export async function GET() {
  return syncReviews();
}

export async function POST() {
  return syncReviews();
}
