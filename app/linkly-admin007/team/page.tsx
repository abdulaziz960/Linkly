import { getCurrentUser } from "../../../lib/auth";
import { getPlatformTeam } from "../../../lib/platform-team";
import AdminPageHeader from "../AdminPageHeader";
import TeamView from "./TeamView";

export default async function AdminTeamPage() {
  const [user, team] = await Promise.all([getCurrentUser(), getPlatformTeam()]);

  return (
    <>
      <AdminPageHeader
        eyebrow={["الفريق", "Team"]}
        title={["فريق المنصة", "Platform team"]}
        description={["الأعضاء الذين يملكون صلاحية الوصول لهذه اللوحة.", "The members who have access to this dashboard."]}
      />
      <TeamView team={team} currentUserId={user?.id || ""} />
    </>
  );
}
