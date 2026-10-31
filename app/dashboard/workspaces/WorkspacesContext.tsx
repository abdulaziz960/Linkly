"use client";

import { createContext, useContext } from "react";
import type { WorkspaceAssignee, WorkspaceState } from "../../../lib/workspaces/types";

export type WorkspacesContextValue = {
  /** null: the feature is off for this account - nothing about projects is shown. */
  state: WorkspaceState | null;
  /** The account is not on the feature: the sidebar shows a locked "add a project" entry that only explains and links to contact. */
  locked: boolean;
  selectScope: (scope: string) => Promise<boolean>;
  createProject: (name: string, color?: string) => Promise<string>;
  /** The employees of every project, for handing a conversation to another project's employee. */
  loadAssignees: () => Promise<WorkspaceAssignee[]>;
  assignAcross: (conversationId: string, employeeId: string | null) => Promise<string>;
};

const noop: WorkspacesContextValue = {
  state: null,
  locked: false,
  selectScope: async () => false,
  createProject: async () => "غير متاح",
  loadAssignees: async () => [],
  assignAcross: async () => "غير متاح"
};

export const WorkspacesContext = createContext<WorkspacesContextValue>(noop);

export function useWorkspaces() {
  return useContext(WorkspacesContext);
}
