import { getAllAdminPermissions } from "./admin-auth";
import { getPlatformTeam } from "./platform-team";

/** Ids of platform admins who currently hold the "team" permission. */
export async function getTeamManagerIds(): Promise<string[]> {
  const team = await getPlatformTeam();
  const permissions = await getAllAdminPermissions(team.map((member) => member.id));
  return team.filter((member) => permissions.get(member.id)?.includes("team")).map((member) => member.id);
}
