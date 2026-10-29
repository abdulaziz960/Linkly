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
    const groups = normalized.slice(7).split(":");
    if (groups.length === 2 && groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
      const high = parseInt(groups[0], 16), low = parseInt(groups[1], 16);
      return isPrivateIPv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return true;
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
  return (await resolvePublicUrl(rawUrl)) !== null;
}

/** Resolve once; callers making a connection must pin it to these checked addresses. */
export async function resolvePublicUrl(rawUrl: string): Promise<{ url: URL; addresses: Array<{ address: string; family: number }> } | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) return null;

  const literalFamily = isIP(hostname);
  if (literalFamily) return isPrivateAddress(literalFamily, hostname) ? null : { url: parsed, addresses: [{ address: hostname, family: literalFamily }] };

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => !isIP(record.address) || isPrivateAddress(record.family, record.address))) return null;
    return { url: parsed, addresses: records };
  } catch {
    return null;
  }
}
