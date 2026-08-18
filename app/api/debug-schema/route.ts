import { NextResponse } from "next/server";
import { ensureSchema } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";

// TEMPORARY diagnostic endpoint - remove once the production login 500 is
// root-caused and fixed. Surfaces the real ensureSchema()/DB error instead
// of the opaque 500 the login route returns.
export async function GET() {
  try {
    await ensureSchema();
    const user = await prisma.userAccount.findUnique({ where: { email: "test@audiencew.sa" } });
    return NextResponse.json({ ok: true, userFound: Boolean(user) });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
