// Types shared by the server and the dashboard. Pure: importing this never pulls the database into the browser bundle.
export type WorkspaceStateProject = { id: string; name: string; color: string; primary: boolean; archived: boolean; member: boolean; unread: number };

export type WorkspaceState = {
  enabled: true;
  accountName: string;
  ownsAccount: boolean;
  /** "all", or the id of the project being shown. */
  scope: string;
  activeProjectId: string;
  canViewAll: boolean;
  projects: WorkspaceStateProject[];
  /** How many projects the account may have (its own workspace counts as one) and how many it has now. */
  quota: { used: number; max: number };
};

export type WorkspaceAssignee = { employeeId: string; name: string; projectId: string; projectName: string; projectColor: string; ownProject: boolean };
