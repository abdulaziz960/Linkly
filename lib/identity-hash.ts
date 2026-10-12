import { createHash } from "crypto";

/**
 * Hashing of customer identifiers for the ad platforms' conversion APIs (Meta, TikTok, Snapchat all match on
 * SHA-256 of the normalised value). Only hashes ever leave Linkly; an empty or invalid value yields "" so the
 * caller simply leaves the field out.
 */

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lower-cased and trimmed, as every platform requires; "" when it is not an email. */
export function hashEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim().toLowerCase();
  return EMAIL.test(value) ? sha256(value) : "";
}

/** A first or last name: lower-cased, trimmed, punctuation removed. */
export function hashName(name: string | null | undefined): string {
  const value = (name ?? "").trim().toLowerCase().replace(/[\p{P}\p{S}\d]/gu, "").replace(/\s+/g, "");
  return value.length >= 2 ? sha256(value) : "";
}

/** Digits only, with the country code (no "+"), the form Meta and Snapchat match on. */
export function hashPhoneDigits(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? sha256(digits) : "";
}

/** "محمد عبدالله العتيبي" -> first "محمد", last "العتيبي"; a single word is only a first name. */
export function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}
