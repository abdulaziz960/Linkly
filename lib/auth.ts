import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getUserAccountById } from "./database";

export const authCookieName = "audiencew_session";

const authSecret = process.env.AUTH_SECRET || "audiencew-local-dev-secret";

function signPayload(payload: string) {
  return createHmac("sha256", authSecret).update(payload).digest("hex");
}

export function createSessionToken(userId: string) {
  const payload = `${userId}.${Date.now()}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token?: string) {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [userId, issuedAt, signature] = parts;
  const payload = `${userId}.${issuedAt}`;
  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  return userId;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = verifySessionToken(cookieStore.get(authCookieName)?.value);

  if (!userId) {
    return null;
  }

  const user = await getUserAccountById(userId);
  if (!user) {
    return null;
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
