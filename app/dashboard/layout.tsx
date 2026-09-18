import type { Metadata } from "next";
import type { ReactNode } from "react";

// Scopes the installable-app identity (see public/manifest.json) to the
// dashboard subtree only - the marketing site under app/layout.tsx isn't
// meant to be "installed" as its own app.
export const metadata: Metadata = {
  manifest: "/manifest.json"
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
