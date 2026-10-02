import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ensureSchema } from "./database";

export type Branch = {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  workingHours: string;
  mapUrl: string;
  active: boolean;
};

export type BranchInput = {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  workingHours?: unknown;
  mapUrl?: unknown;
  active?: unknown;
};

export type CleanBranch = Omit<Branch, "id">;

const MAX_BRANCHES = 200;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseCoordinate(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pulls "lat,lng" out of a pasted Google Maps address: .../@24.71,46.67,15z,
 * ?q=24.71,46.67, ?ll=..., !3d24.71!4d46.67 (the place pin), or just "24.71, 46.67".
 * Short links (maps.app.goo.gl) carry no coordinates - the API route resolves
 * those by following the redirect first (see resolveMapsShortLink).
 */
export function extractCoordinates(input: string): { latitude: number; longitude: number } | null {
  const value = decodeURIComponent(input.trim());
  const patterns = [
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|center|destination)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /^\s*(-?\d{1,3}\.\d+)\s*[,،\s]\s*(-?\d{1,3}\.\d+)\s*$/
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (validCoordinates(latitude, longitude)) return { latitude, longitude };
    }
  }
  return null;
}

export function validCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0);
}

export function cleanBranchInput(raw: BranchInput): { ok: true; data: CleanBranch } | { ok: false; error: string } {
  const name = text(raw.name, 120);
  if (!name) return { ok: false, error: "اسم الفرع مطلوب" };

  let latitude = parseCoordinate(raw.latitude);
  let longitude = parseCoordinate(raw.longitude);
  const mapUrl = text(raw.mapUrl, 600);
  if ((latitude === null || longitude === null) && mapUrl) {
    const found = extractCoordinates(mapUrl);
    if (found) ({ latitude, longitude } = found);
  }
  if (latitude === null || longitude === null || !validCoordinates(latitude, longitude)) {
    return { ok: false, error: "موقع الفرع غير صالح: أدخل خط العرض والطول أو الصق رابط الموقع من خرائط Google" };
  }
  if (mapUrl && !/^https?:\/\//i.test(mapUrl)) return { ok: false, error: "رابط الخريطة غير صالح" };

  return {
    ok: true,
    data: {
      name,
      address: text(raw.address, 300),
      phone: text(raw.phone, 40),
      latitude,
      longitude,
      workingHours: text(raw.workingHours, 200),
      mapUrl,
      active: raw.active === undefined ? true : Boolean(raw.active)
    }
  };
}

function toBranch(row: { id: string; name: string; address: string; phone: string; latitude: number; longitude: number; workingHours: string; mapUrl: string; active: number }): Branch {
  return { id: row.id, name: row.name, address: row.address, phone: row.phone, latitude: row.latitude, longitude: row.longitude, workingHours: row.workingHours, mapUrl: row.mapUrl, active: row.active === 1 };
}

export async function listBranches(tenantId: string, options: { activeOnly?: boolean } = {}): Promise<Branch[]> {
  await ensureSchema();
  const rows = await prisma.branch.findMany({
    where: { tenantId, ...(options.activeOnly ? { active: 1 } : {}) },
    orderBy: { createdAt: "asc" },
    take: MAX_BRANCHES
  });
  return rows.map(toBranch);
}

export async function createBranch(tenantId: string, data: CleanBranch): Promise<Branch | null> {
  await ensureSchema();
  const count = await prisma.branch.count({ where: { tenantId } });
  if (count >= MAX_BRANCHES) return null;
  const now = new Date().toISOString();
  const row = await prisma.branch.create({
    data: { id: randomUUID(), tenantId, ...data, active: data.active ? 1 : 0, createdAt: now, updatedAt: now }
  });
  return toBranch(row);
}

export async function updateBranch(tenantId: string, id: string, data: CleanBranch): Promise<Branch | null> {
  await ensureSchema();
  const updated = await prisma.branch.updateMany({
    where: { id, tenantId },
    data: { ...data, active: data.active ? 1 : 0, updatedAt: new Date().toISOString() }
  });
  if (updated.count === 0) return null;
  const row = await prisma.branch.findFirst({ where: { id, tenantId } });
  return row ? toBranch(row) : null;
}

export async function deleteBranch(tenantId: string, id: string): Promise<boolean> {
  await ensureSchema();
  const result = await prisma.branch.deleteMany({ where: { id, tenantId } });
  return result.count > 0;
}

/** Great-circle distance in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearestBranch(branches: Branch[], latitude: number, longitude: number): { branch: Branch; distanceKm: number } | null {
  let best: { branch: Branch; distanceKm: number } | null = null;
  for (const branch of branches) {
    const distance = distanceKm(latitude, longitude, branch.latitude, branch.longitude);
    if (!best || distance < best.distanceKm) best = { branch, distanceKm: distance };
  }
  return best;
}

export function branchMapUrl(branch: Pick<Branch, "latitude" | "longitude" | "mapUrl">): string {
  return branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} متر`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} كم`;
}
