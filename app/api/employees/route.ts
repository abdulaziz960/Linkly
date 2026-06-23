import { NextRequest } from "next/server";
import { getEmployees } from "../../../lib/database";
import { prisma } from "../../../lib/prisma";
import { jsonError, jsonOk } from "../_utils/json";

export const runtime = "nodejs";

export async function GET() {
  return jsonOk(await getEmployees());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name?: string;
    email?: string;
    role?: string;
    status?: string;
    permissions?: string;
  };
  const name = body.name?.trim();
  const email = body.email?.trim();

  if (!name) return jsonError("اسم الموظف مطلوب");
  if (!email) return jsonError("البريد الإلكتروني مطلوب");

  const employee = await prisma.employee.create({
    data: {
      id: `emp-${Date.now()}`,
      name,
      email,
      role: body.role || "موظف دعم",
      status: body.status || "متصل",
      permissions: body.permissions || "محادثات فقط",
      initial: name.slice(0, 1)
    }
  });

  return jsonOk(employee);
}
