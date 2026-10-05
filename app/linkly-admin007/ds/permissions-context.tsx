"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ADMIN_PERMISSIONS, type AdminPermission } from "../../../lib/admin-permissions";

type Value = { permissions: readonly AdminPermission[]; can: (permission: AdminPermission) => boolean };

const AdminPermissionsContext = createContext<Value>({ permissions: ADMIN_PERMISSIONS, can: () => true });

// The server already enforces permissions on every page and API route; this
// context only lets the UI hide controls the member could not use anyway.
export function AdminPermissionsProvider({ permissions, children }: { permissions: readonly AdminPermission[]; children: ReactNode }) {
  const value = useMemo<Value>(() => ({ permissions, can: (permission) => permissions.includes(permission) }), [permissions]);
  return <AdminPermissionsContext.Provider value={value}>{children}</AdminPermissionsContext.Provider>;
}

export function useAdminPermissions() {
  return useContext(AdminPermissionsContext);
}
