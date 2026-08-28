import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "enc:v1";
export const SECRET_MASK = "••••••••";
export const integrationSecretFields = [
  "configId",
  "verifyToken",
  "accessToken",
  "xConsumerSecret",
  "xBearerToken",
  "xAccessToken",
  "xAccessTokenSecret",
  "googleRefreshToken"
] as const;

function encryptionKey() {
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || process.env.ENCRYPTION_KEY?.trim();
  if (requiresProductionIntegrationKey()) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY is required in production for integration secret encryption");
  }
  return createHash("sha256").update(configured || "audiencew-development-only-encryption-key").digest();
}

function requiresProductionIntegrationKey() {
  // Next.js evaluates route modules during production builds to collect route
  // metadata. The key is still mandatory when the deployed function starts.
  return process.env.NODE_ENV === "production"
    && process.env.NEXT_PHASE !== "phase-production-build"
    && !process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
}

export function hasIntegrationEncryptionKey() {
  return Boolean(process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || process.env.ENCRYPTION_KEY?.trim());
}

export function assertIntegrationEncryptionConfigured() {
  if (requiresProductionIntegrationKey()) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY is required in production for integration secret encryption");
  }
}

export function encryptSecret(value: string) {
  if (!value || value.startsWith(`${PREFIX}:`)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value?: string | null) {
  if (!value || !value.startsWith(`${PREFIX}:`)) return value || "";
  const parts = value.split(":");
  if (parts.length !== 5) throw new Error("Invalid encrypted secret format");
  const [, , ivValue, tagValue, encryptedValue] = parts;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function maskIntegrationSecrets<T extends Record<string, unknown>>(settings: T): T {
  const result: Record<string, unknown> = { ...settings };
  for (const field of integrationSecretFields) {
    if (typeof result[field] === "string" && result[field]) result[field] = SECRET_MASK;
  }
  return result as T;
}
