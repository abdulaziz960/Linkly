import type {
  AutomationRule,
  Campaign,
  Conversation,
  Customer,
  Employee,
  IntegrationSettings,
  Lead,
  MessageTemplate,
  QuickReply,
  Tag,
  Team,
  ViewKey,
  WorkSchedule
} from "../types";
import AutomationsView from "./AutomationsView";
import BotView from "./BotView";
import CampaignsView from "./CampaignsView";
import CommunicationChannelsView from "./CommunicationChannelsView";
import ContactsView from "./ContactsView";
import EmployeesView from "./EmployeesView";
import LeadsView from "./LeadsView";
import QuickRepliesView from "./QuickRepliesView";
import ReportsView from "./ReportsView";
import SettingsView from "./SettingsView";
import TagsView from "./TagsView";
import TeamsView from "./TeamsView";
import TemplatesView from "./TemplatesView";
import WorkHoursView from "./WorkHoursView";

type DashboardViewRouterProps = {
  conversations: Conversation[];
  customers: Customer[];
  employees: Employee[];
  quickReplies: QuickReply[];
  automationRules: AutomationRule[];
  campaigns: Campaign[];
  workSchedules: WorkSchedule[];
  leads: Lead[];
  tags: Tag[];
  teams: Team[];
  templates: MessageTemplate[];
  integrationStatus: IntegrationSettings["status"];
  onIntegrationChange: (settings: IntegrationSettings) => void;
  onRefreshData: () => Promise<void>;
  onOpenConversation: (conversationId: string) => void;
  view: ViewKey;
};

export default function DashboardViewRouter({
  conversations,
  customers,
  employees,
  quickReplies,
  automationRules,
  campaigns,
  workSchedules,
  leads,
  onOpenConversation,
  onIntegrationChange,
  onRefreshData,
  tags,
  teams,
  templates,
  integrationStatus,
  view
}: DashboardViewRouterProps) {
  if (view === "contacts") return <ContactsView customers={customers} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} />;
  if (view === "communicationChannels") return <CommunicationChannelsView integrationStatus={integrationStatus} />;
  if (view === "tags") return <TagsView conversations={conversations} tags={tags} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} />;
  if (view === "bot") return <BotView />;
  if (view === "automations") {
    return (
      <AutomationsView
        automationRules={automationRules}
        employees={employees}
        tags={tags}
        teams={teams}
        templates={templates}
        onRefreshData={onRefreshData}
      />
    );
  }
  if (view === "campaigns") return <CampaignsView campaigns={campaigns} templates={templates} onRefreshData={onRefreshData} />;
  if (view === "templates") return <TemplatesView templates={templates} onRefreshData={onRefreshData} />;
  if (view === "quickReplies") return <QuickRepliesView quickReplies={quickReplies} teams={teams} onRefreshData={onRefreshData} />;
  if (view === "workHours") return <WorkHoursView teams={teams} workSchedules={workSchedules} onRefreshData={onRefreshData} />;
  if (view === "reports") return <ReportsView conversations={conversations} employees={employees} teams={teams} />;
  if (view === "leads") return <LeadsView employees={employees} leads={leads} onRefreshData={onRefreshData} />;
  if (view === "teams") return <TeamsView employees={employees} teams={teams} onRefreshData={onRefreshData} />;
  if (view === "employees") return <EmployeesView employees={employees} onRefreshData={onRefreshData} />;
  if (view === "settings") return <SettingsView onIntegrationChange={onIntegrationChange} />;
  return null;
}
