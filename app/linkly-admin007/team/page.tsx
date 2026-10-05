import { getCurrentUser } from "../../../lib/auth";
import { getPlatformTeam } from "../../../lib/platform-team";
import { getAllAdminPermissions } from "../../../lib/admin-auth";
import AdminPageHeader from "../AdminPageHeader";
import TeamView from "./TeamView";
import { guardPage } from "../guard";

// Server timestamp for relative times; read outside render so the component stays pure.
const nowMs = () => Date.now();

export default async function AdminTeamPage() {
  const denied = await guardPage("team");
  if (denied) return denied;
  const [user, members] = await Promise.all([getCurrentUser(), getPlatformTeam()]);
  const permissionsById = await getAllAdminPermissions(members.map((member) => member.id));
  const team = members.map((member) => ({ ...member, permissions: permissionsById.get(member.id) ?? [] }));

  return (
    <>
      <AdminPageHeader
        eyebrow={["الفريق", "Team"]}
        title={["فريق المنصة", "Platform team"]}
        description={["الأعضاء الذين يملكون صلاحية الوصول لهذه اللوحة.", "The members who have access to this dashboard."]}
      />
      <TeamView team={team} currentUserId={user?.id || ""} generatedAt={nowMs()} />
    </>
  );
}
