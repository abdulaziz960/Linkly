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
import ViewTabs from "./ViewTabs";
import OperationsView from "./OperationsView";
import ReportsView from "./ReportsView";
import AiSettingsView from "./AiSettingsView";
import KnowledgeBaseView from "./KnowledgeBaseView";
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
  canViewPipeline?: boolean;
  canViewTeams?: boolean;
  canViewEmployees?: boolean;
  canViewWorkHours?: boolean;
  canViewSettings?: boolean;
  canViewIntegrations?: boolean;
  canViewDevelopers?: boolean;
  canViewCatalog?: boolean;
  canViewBranches?: boolean;
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
  canViewPipeline = false,
  canViewTeams = false,
  canViewEmployees = false,
  canViewWorkHours = false,
  canViewSettings = false,
  canViewIntegrations = false,
  canViewDevelopers = false,
  canViewCatalog = false,
  canViewBranches = false,
  view
}: DashboardViewRouterProps) {
  if (view === "operations" || view === "reports") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel="التقارير والعمليات"
        tabs={[
          { viewKey: "operations", label: "الآن (مركز العمليات)", lockLabel: "مركز العمليات", available: view === "operations" || canViewOperations, content: <OperationsView conversations={conversations} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> },
          { viewKey: "reports", label: "التقارير", available: view === "reports" || canViewReports, content: <ReportsView conversations={conversations} employees={employees} teams={teams} workSchedules={workSchedules} onOpenConversation={onOpenConversation} /> }
        ]}
      />
    );
  }
  if (view === "contacts" || view === "tags" || view === "pipeline") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel="العملاء والعملاء المحتملون والوسوم"
        tabs={[
          { viewKey: "contacts", label: "العملاء", available: view === "contacts" || canViewContacts, content: <ContactsView customers={customers} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> },
          { viewKey: "pipeline", label: "العملاء المحتملون", available: view === "pipeline" || canViewPipeline, content: <PipelineView conversations={conversations} automationRules={automationRules} templates={templates} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> },
          { viewKey: "tags", label: "الوسوم", available: view === "tags" || canViewTags, content: <TagsView conversations={conversations} tags={tags} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> }
        ]}
      />
    );
  }
  if (view === "bot") return <BotView teams={teams} employees={employees} />;
  if (view === "ai" || view === "knowledgeBase") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel="مساعد AI وقاعدة المعرفة"
        note={<p className="muted-copy" style={{ margin: "10px 24px 0" }}>المساعد وخطوة «رد AI تلقائي» لا يجيبان إلا من قاعدة المعرفة، فأضف فيها أسئلتك وأجوبتك أولًا.</p>}
        tabs={[
          { viewKey: "knowledgeBase", label: "قاعدة المعرفة", available: view === "knowledgeBase" || canViewKnowledgeBase, content: <KnowledgeBaseView /> },
          { viewKey: "ai", label: "إعدادات المساعد", available: view === "ai" || canViewAi, content: <AiSettingsView /> }
        ]}
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
  if (view === "templates") return <TemplatesView templates={templates} whatsappConnected={whatsappConnected} onRefreshData={onRefreshData} />;
  if (view === "quickReplies") return <QuickRepliesView quickReplies={quickReplies} teams={teams} onRefreshData={onRefreshData} />;
  if (view === "teams" || view === "employees" || view === "workHours") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel="الموظفون والفرق"
        tabs={[
          { viewKey: "employees", label: "الموظفون والصلاحيات", available: view === "employees" || canViewEmployees, content: <EmployeesView employees={employees} conversations={conversations} teams={teams} onRefreshData={onRefreshData} /> },
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
  if (view === "catalog" || view === "branches") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel="الكتالوج والفروع"
        tabs={[
          { viewKey: "catalog", label: "الكتالوج", available: view === "catalog" || canViewCatalog, content: <CatalogView /> },
          { viewKey: "branches", label: "الفروع", available: view === "branches" || canViewBranches, content: <BranchesView /> }
        ]}
      />
    );
  }
  if (view === "branding") return <BrandingView onRefreshData={onRefreshData} />;
  return null;
}
