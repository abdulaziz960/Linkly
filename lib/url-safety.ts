import { promises as dns } from "dns";
import { isIP } from "net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 - link-local, and where every major cloud provider
  // (GCP, AWS, Azure) serves its instance-metadata/credential endpoint.
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.split(":").pop() || "";
    if (mapped.includes(".")) return isPrivateIPv4(mapped);
  }
  if (/^fe[89ab]/.test(normalized)) return true; // fe80::/10 link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique local
  return false;
}

function isPrivateAddress(family: number, address: string): boolean {
  return family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
}

/**
 * Whether a tenant-supplied URL is safe for the SERVER to fetch on its own
 * behalf (outbound webhook delivery). Rejects anything that resolves to a
 * loopback/link-local/private/reserved address - including cloud metadata
 * endpoints (169.254.169.254) - to close off server-side request forgery.
 * Re-run this immediately before every actual fetch, not just at
 * registration time: a hostname's DNS record can change between when a
 * tenant registers the webhook and when an event later triggers delivery
 * (DNS rebinding), so a one-time check at creation is not enough on its own.
 */
export async function isPubliclyRoutableUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;

  const literalFamily = isIP(hostname);
  if (literalFamily) return !isPrivateAddress(literalFamily, hostname);

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length) return false;
    return records.every((record) => !isPrivateAddress(record.family, record.address));
  } catch {
    return false;
  }
}
