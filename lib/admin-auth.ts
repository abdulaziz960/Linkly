import { getCurrentUser } from "./auth";

export async function requirePlatformAdmin() {
  const user = await getCurrentUser();
  if (!user || user.isPlatformAdmin !== 1) return null;
  return user;
}
