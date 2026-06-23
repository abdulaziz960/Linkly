import type { Employee } from "../types";

export const employees: Employee[] = [
  {
    id: "emp-owner",
    name: "عبدالعزيز الكيالي",
    role: "مالك الحساب",
    status: "متصل",
    permissions: "الكل",
    email: "abdulaziz@audiencew.sa",
    initial: "ع"
  },
  {
    id: "emp-noura",
    name: "نورة القحطاني",
    role: "موظف دعم",
    status: "متصل",
    permissions: "محادثات + عملاء",
    email: "noura@audiencew.sa",
    initial: "ن"
  },
  {
    id: "emp-sarah",
    name: "سارة الحربي",
    role: "موظف دعم",
    status: "مشغول",
    permissions: "وسوم + حملات",
    email: "sarah@audiencew.sa",
    initial: "س"
  },
  {
    id: "emp-abdullah",
    name: "عبدالله العتيبي",
    role: "موظف دعم",
    status: "غير متصل",
    permissions: "محادثات فقط",
    email: "abdullah@audiencew.sa",
    initial: "ع"
  }
];

export const assigneeOptions = [...employees.map((employee) => employee.name), "بدون موظف"];
