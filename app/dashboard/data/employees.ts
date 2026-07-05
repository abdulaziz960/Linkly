import type { Employee } from "../types";

export const employees: Employee[] = [
  {
    id: "emp-owner",
    name: "عبدالعزيز الكيالي",
    role: "مالك الحساب",
    status: "متصل",
    permissions: "الكل",
    email: "admin@audiencew.sa",
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
  }
];

export const assigneeOptions = [...employees.map((employee) => employee.name), "بدون موظف"];
