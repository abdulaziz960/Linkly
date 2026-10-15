"use client";

import { useEffect, useState } from "react";
import type { Conversation, Employee, Team, WorkSchedule } from "../types";
import { useLanguage } from "../i18n";
import OperationsView from "./OperationsView";
import ReportsView from "./ReportsView";

type Tab = "now" | "reports";

type ReportsHubProps = {
  initialTab: Tab;
  canViewOperations: boolean;
  canViewReports: boolean;
  conversations: Conversation[];
  employees: Employee[];
  teams: Team[];
  workSchedules: WorkSchedule[];
  onOpenConversation: (id: string) => void;
  onRefreshData: () => Promise<void>;
};

/**
 * One analytics page with two tabs: "now" (the live operations board) and "reports" (the period reports).
 * Both used to be separate sidebar entries that repeated the same waiting / SLA / unassigned figures.
 * A tab only shows for someone who may see that part; with a single one there is no tab bar.
 */
export default function ReportsHub({ initialTab, canViewOperations, canViewReports, conversations, employees, teams, workSchedules, onOpenConversation, onRefreshData }: ReportsHubProps) {
  const { t } = useLanguage();
  const both = canViewOperations && canViewReports;
  const [tab, setTab] = useState<Tab>(() => (both ? initialTab : canViewOperations && !canViewReports ? "now" : "reports"));

  // Follow the sidebar: opening the page from the old "operations" key lands on the live tab.
  useEffect(() => {
    setTab((current) => {
      if (!both) return canViewOperations && !canViewReports ? "now" : "reports";
      return initialTab === current ? current : initialTab;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, canViewOperations, canViewReports]);

  function choose(next: Tab) {
    setTab(next);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("view", next === "now" ? "operations" : "reports");
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    } catch {
      // the address is a convenience only
    }
  }

  return (
    <>
      {both ? (
        <div className="pipeline-tabs reports-hub-tabs" role="tablist" aria-label={t("التقارير والعمليات", "Reports and operations")}>
          <button type="button" role="tab" aria-selected={tab === "now"} onClick={() => choose("now")}>{t("الآن (مركز العمليات)", "Live now")}</button>
          <button type="button" role="tab" aria-selected={tab === "reports"} onClick={() => choose("reports")}>{t("التقارير", "Reports")}</button>
        </div>
      ) : null}
      {tab === "now" && canViewOperations ? (
        <OperationsView conversations={conversations} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} />
      ) : (
        <ReportsView conversations={conversations} employees={employees} teams={teams} workSchedules={workSchedules} onOpenConversation={onOpenConversation} />
      )}
    </>
  );
}
