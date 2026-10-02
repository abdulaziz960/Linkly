import { extractCoordinates, type BranchInput } from "./branches";

const GOOGLE_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page|g\.co)$/i;
const SHORT_HOST = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|g\.page)$/i;
const MAX_HOPS = 5;

/**
 * Turns a pasted Google Maps link into coordinates. Full links carry them in
 * the URL; short share links (maps.app.goo.gl/...) only redirect to the full
 * link, so those are followed - but only across Google's own hosts, so this
 * can never be pointed at an arbitrary/internal address.
 */
export async function coordinatesFromMapsLink(rawUrl: string): Promise<{ latitude: number; longitude: number } | null> {
  const direct = extractCoordinates(rawUrl);
  if (direct) return direct;

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !GOOGLE_HOST.test(url.hostname)) return null;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (!GOOGLE_HOST.test(url.hostname) || url.protocol !== "https:") return null;
    const found = extractCoordinates(url.toString());
    if (found) return found;
    // Only short/share links are worth following; a regular maps URL with no coordinates in it isn't.
    if (!SHORT_HOST.test(url.hostname) && hop > 0 && !/\/maps/i.test(url.pathname)) return null;

    let response: Response;
    try {
      response = await fetch(url.toString(), { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LinklyBranches/1.0)" } });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      url = new URL(location, url);
      continue;
    }
    // Final page: some share pages embed the pin in the HTML instead of the URL.
    const html = (await response.text().catch(() => "")).slice(0, 400_000);
    const inHtml = html.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/) || html.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
    if (inHtml) {
      const latitude = Number(inHtml[1]);
      const longitude = Number(inHtml[2]);
      return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
    }
    return null;
  }
  return null;
}

// A pasted share link ("maps.app.goo.gl/...") has no coordinates in it -
// resolve it before validating so the form only needs the link.
export async function withResolvedCoordinates(body: BranchInput): Promise<BranchInput> {
  const hasCoords = body.latitude !== "" && body.latitude != null && body.longitude !== "" && body.longitude != null;
  if (!hasCoords && typeof body.mapUrl === "string" && body.mapUrl.trim()) {
    const found = await coordinatesFromMapsLink(body.mapUrl);
    if (found) return { ...body, latitude: found.latitude, longitude: found.longitude };
  }
  return body;
}
