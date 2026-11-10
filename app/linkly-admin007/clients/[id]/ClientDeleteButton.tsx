"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../ds/primitives";
import { useConfirm } from "../../ds/Dialog";
import { adminRequest } from "../../ds/forms";
import { useToast } from "../../ds/Toast";

/** Permanently deletes the client and all of its data (DELETE /api/admin/clients/[id]); the company name must be retyped. */
export default function ClientDeleteButton({ tenantId, companyName }: { tenantId: string; companyName: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: `حذف «${companyName}» نهائيًا؟`,
      description: "يُحذف العميل وكل بياناته: المحادثات والعملاء والموظفون وحسابات الدخول والإعدادات والمشاريع. لا يمكن التراجع. يُسمح بهذا لحساب لم يدفع قط فقط، وحسابات المدفوعين تُوقف بدل الحذف.",
      confirmLabel: "حذف نهائي",
      tone: "danger",
      requireText: companyName
    });
    if (!ok) return;
    setBusy(true);
    const result = await adminRequest(`/api/admin/clients/${encodeURIComponent(tenantId)}`, { method: "DELETE", body: { confirmCompanyName: companyName } });
    setBusy(false);
    if (!result.ok) {
      toast("error", result.error);
      return;
    }
    toast("success", "تم حذف العميل نهائيًا");
    router.push("/linkly-admin007/clients");
    router.refresh();
  }

  return <Button variant="danger" icon="trash" loading={busy} onClick={() => void remove()}>حذف العميل</Button>;
}
