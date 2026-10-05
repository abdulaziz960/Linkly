import AdminPageHeader from "../AdminPageHeader";
import DevelopmentView from "./DevelopmentView";
import { guardPage } from "../guard";

export default async function AdminDevelopmentPage() {
  const denied = await guardPage("support");
  if (denied) return denied;
  return (
    <>
      <AdminPageHeader
        eyebrow={["التطوير", "Development"]}
        title={["اقتراحات تطوير المنصة", "Platform development suggestions"]}
        description={[
          "أفكار وميزات اقترحها العملاء لإضافتها إلى Linkly، مع إمكانية قبولها أو رفضها مع ذكر السبب.",
          "Ideas and features customers suggested adding to Linkly, with the ability to accept or reject them with a reason."
        ]}
      />
      <DevelopmentView />
    </>
  );
}
