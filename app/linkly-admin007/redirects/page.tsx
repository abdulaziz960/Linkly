import { listRedirects } from "../../../lib/redirects";
import AdminPageHeader from "../AdminPageHeader";
import RedirectsAdminView from "./RedirectsAdminView";
import { guardPage } from "../guard";

export const dynamic = "force-dynamic";

export default async function AdminRedirectsPage() {
  const denied = await guardPage("content");
  if (denied) return denied;
  const rules = await listRedirects();

  return (
    <>
      <AdminPageHeader
        eyebrow={["التحويلات", "Redirects"]}
        title={["إدارة التحويلات", "Manage redirects"]}
        description={["حوّل رابطًا قديمًا إلى رابط جديد (301 دائم أو 302 مؤقت)، أو أعلن حذف صفحة نهائيًا (410)، بدون تعديل الكود.", "Send an old URL to a new one (301 permanent or 302 temporary), or mark a page as gone (410), without touching code."]}
      />
      <RedirectsAdminView initialRules={rules} />
    </>
  );
}
