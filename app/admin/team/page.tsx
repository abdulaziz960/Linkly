import { getCurrentUser } from "../../../lib/auth";
import { getPlatformTeam } from "../../../lib/platform-team";
import TeamView from "./TeamView";

export default async function AdminTeamPage() {
  const [user, team] = await Promise.all([getCurrentUser(), getPlatformTeam()]);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header-copy">
          <p>الفريق</p>
          <h1>فريق المنصة</h1>
          <span>الأعضاء الذين يملكون صلاحية الوصول لهذه اللوحة.</span>
        </div>
      </header>
      <TeamView team={team} currentUserId={user?.id || ""} />
    </>
  );
}
