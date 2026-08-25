import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

const MAX_PROFILE_LOGO_BYTES = 512 * 1024;

function isSupportedImage(mimeType: string, bytes: Buffer) {
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (mimeType === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function validateProfileLogo(value: unknown) {
  if (value === "") return "";
  if (typeof value !== "string") return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_PROFILE_LOGO_BYTES || !isSupportedImage(match[1], bytes)) return null;
  return value;
}

export async function GET() {
  const user = await getCurrentUser({ allowExpired: true });

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { profileLogo?: unknown } | null;
  const profileLogo = validateProfileLogo(body?.profileLogo);
  if (profileLogo === null) {
    return NextResponse.json({ error: "صيغة الشعار غير مدعومة أو حجمه أكبر من الحد المسموح" }, { status: 400 });
  }

  const updatedUser = await prisma.userAccount.update({
    where: { id: user.id },
    data: { profileLogo },
    select: { profileLogo: true }
  });
  return NextResponse.json({ ok: true, profileLogo: updatedUser.profileLogo });
}
