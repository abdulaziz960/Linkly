import { createHmac, timingSafeEqual } from "crypto";

export function verifyPrefixedHmac(
  payload: string | Buffer,
  receivedSignature: string | null,
  secrets: Array<string | null | undefined>,
  encoding: "hex" | "base64"
) {
  if (!receivedSignature?.startsWith("sha256=")) return false;
  const configuredSecrets = secrets.map((secret) => secret?.trim()).filter((secret): secret is string => Boolean(secret));
  if (!configuredSecrets.length) return false;

  return configuredSecrets.some((secret) => {
    const expected = `sha256=${createHmac("sha256", secret).update(payload).digest(encoding)}`;
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(receivedSignature);
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  });
}
