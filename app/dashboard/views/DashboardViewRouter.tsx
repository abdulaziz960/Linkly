import type {
  AutomationRule,
  Campaign,
  Conversation,
  Customer,
  Employee,
  IntegrationSettings,
  MessageTemplate,
  QuickReply,
  Tag,
  Team,
  ViewKey,
  WorkSchedule
} from "../types";
import AutomationsView from "./AutomationsView";
import BotView from "./BotView";
import BrandingView from "./BrandingView";
import CampaignsView from "./CampaignsView";
import ContactsView from "./ContactsView";
import CatalogView from "./CatalogView";
import DevelopersView from "./DevelopersView";
import EmailPromotionsView from "./EmailPromotionsView";
import EmployeesView from "./EmployeesView";
import IntegrationsView from "./IntegrationsView";
import PipelineView from "./PipelineView";
import QuickRepliesView from "./QuickRepliesView";
import ReportsHub from "./ReportsHub";
import AiHub from "./AiHub";
import ViewTabs from "./ViewTabs";
import SegmentsView from "./SegmentsView";
import SettingsView from "./SettingsView";
import TagsView from "./TagsView";
import BranchesView from "./BranchesView";
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
  tags: Tag[];
  teams: Team[];
  templates: MessageTemplate[];
  whatsappConnected: boolean;
  branding: { name: string; logoDataUrl: string; color: string };
  onIntegrationChange: (settings: IntegrationSettings) => void;
  onRefreshData: () => Promise<void>;
  onOpenConversation: (conversationId: string) => void;
  canViewOperations?: boolean;
  canViewReports?: boolean;
  canViewAi?: boolean;
  canViewKnowledgeBase?: boolean;
  canViewContacts?: boolean;
  canViewTags?: boolean;
  canViewTeams?: boolean;
  canViewEmployees?: boolean;
  canViewWorkHours?: boolean;
  canViewSettings?: boolean;
  canViewIntegrations?: boolean;
  canViewDevelopers?: boolean;
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
  onOpenConversation,
  onIntegrationChange,
  onRefreshData,
  tags,
  teams,
  templates,
  whatsappConnected,
  branding,
  canViewOperations = false,
  canViewReports = false,
  canViewAi = false,
  canViewKnowledgeBase = false,
  canViewContacts = false,
  canViewTags = false,
  canViewTeams = false,
  canViewEmployees = false,
  canViewWorkHours = false,
  canViewSettings = false,
  canViewIntegrations = false,
  canViewDevelopers = false,
  view
}: DashboardViewRouterProps) {
  if (view === "operations" || view === "reports") {
    return (
      <ReportsHub
        initialTab={view === "operations" ? "now" : "reports"}
        canViewOperations={view === "operations" ? true : canViewOperations}
        canViewReports={view === "reports" ? true : canViewReports}
        conversations={conversations}
        employees={employees}
        teams={teams}
        workSchedules={workSchedules}
        onOpenConversation={onOpenConversation}
        onRefreshData={onRefreshData}
      />
    );
  }
  if (view === "contacts" || view === "tags") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel="العملاء والوسوم"
        tabs={[
          { viewKey: "contacts", label: "العملاء", available: view === "contacts" || canViewContacts, content: <ContactsView customers={customers} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> },
          { viewKey: "tags", label: "الوسوم", available: view === "tags" || canViewTags, content: <TagsView conversations={conversations} tags={tags} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> }
        ]}
      />
    );
  }
  if (view === "bot") return <BotView teams={teams} employees={employees} />;
  if (view === "ai" || view === "knowledgeBase") {
    return (
      <AiHub
        initialTab={view === "knowledgeBase" ? "knowledge" : "assistant"}
        canViewAssistant={view === "ai" ? true : canViewAi}
        canViewKnowledge={view === "knowledgeBase" ? true : canViewKnowledgeBase}
      />
    );
  }
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
  if (view === "campaigns") return <CampaignsView campaigns={campaigns} templates={templates} whatsappConnected={whatsappConnected} brandName={branding.name} onRefreshData={onRefreshData} />;
  if (view === "emailPromotions") return <EmailPromotionsView customers={customers} conversations={conversations} tags={tags} />;
  if (view === "segments") return <SegmentsView tags={tags} />;
  if (view === "pipeline") return <PipelineView conversations={conversations} automationRules={automationRules} templates={templates} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} />;
  if (view === "templates") return <TemplatesView templates={templates} whatsappConnected={whatsappConnected} onRefreshData={onRefreshData} />;
  if (view === "quickReplies") return <QuickRepliesView quickReplies={quickReplies} teams={teams} onRefreshData={onRefreshData} />;
  if (view === "teams" || view === "employees" || view === "workHours") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel="الموظفون والفرق"
        tabs={[
          { viewKey: "employees", label: "الموظفون والصلاحيات", available: view === "employees" || canViewEmployees, content: <EmployeesView employees={employees} conversations={conversations} onRefreshData={onRefreshData} /> },
          { viewKey: "teams", label: "الفرق", available: view === "teams" || canViewTeams, content: <TeamsView employees={employees} teams={teams} onRefreshData={onRefreshData} /> },
          { viewKey: "workHours", label: "ساعات العمل", available: view === "workHours" || canViewWorkHours, content: <WorkHoursView teams={teams} workSchedules={workSchedules} onRefreshData={onRefreshData} /> }
        ]}
      />
    );
  }
  if (view === "settings" || view === "integrations" || view === "developers") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel="الإعدادات والربط"
        tabs={[
          { viewKey: "settings", label: "القنوات", available: view === "settings" || canViewSettings, content: <SettingsView onIntegrationChange={onIntegrationChange} /> },
          { viewKey: "integrations", label: "التكاملات", available: view === "integrations" || canViewIntegrations, content: <IntegrationsView /> },
          { viewKey: "developers", label: "المطورون", available: view === "developers" || canViewDevelopers, content: <DevelopersView /> }
        ]}
      />
    );
  }
  if (view === "catalog") return <CatalogView />;
  if (view === "branches") return <BranchesView />;
  if (view === "branding") return <BrandingView onRefreshData={onRefreshData} />;
  return null;
}
