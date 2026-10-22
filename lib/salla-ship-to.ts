// Pure helpers for a Salla shipment address; client-safe (no server imports).

export type ShipTo = {
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  address_line: string;
  street_number: string;
  block: string;
  short_address: string;
  building_number: string;
  additional_number: string;
  postal_code: string;
  lat: string;
  lng: string;
};

/** Pure: what stops a shipment from being accepted by Salla (Arabic messages); empty when the address is complete. */
export function shipToProblems(shipTo: ShipTo): string[] {
  const problems: string[] = [];
  const short = shipTo.short_address.trim();
  if (!short) problems.push("العنوان المختصر مطلوب");
  else if (!/^[A-Za-z]{4}\d{4}$/.test(short)) problems.push("العنوان المختصر يجب أن يكون 4 أحرف إنجليزية ثم 4 أرقام، مثل RHMA3184");
  const lat = Number(shipTo.lat);
  const lng = Number(shipTo.lng);
  if (!shipTo.lat.trim() || !shipTo.lng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) problems.push("الإحداثيات مطلوبة (خط العرض وخط الطول)");
  else if (Math.abs(lat) > 90 || Math.abs(lng) > 180) problems.push("الإحداثيات غير صحيحة");
  return problems;
}

/** Pure: "24.7136, 46.6753" (copied from Google Maps) into its two parts, or null. */
export function splitCoordinates(value: string): { lat: string; lng: string } | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,،]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  return match ? { lat: match[1], lng: match[2] } : null;
}
