import { useLanguage } from "../i18n";
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
import CampaignsHub from "../components/CampaignsHub";
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
  canViewBranding?: boolean;
  canViewCampaigns?: boolean;
  canViewEmailPromotions?: boolean;
  canViewBot?: boolean;
  canViewAutomations?: boolean;
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
  canViewBranding = false,
  canViewCampaigns = false,
  canViewEmailPromotions = false,
  canViewBot = false,
  canViewAutomations = false,
  view
}: DashboardViewRouterProps) {
  const { t } = useLanguage();
  if (view === "operations" || view === "reports") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel={t("التقارير والعمليات", "Reports and operations")}
        tabs={[
          { viewKey: "operations", label: t("الآن (مركز العمليات)", "Now (Operations Center)"), lockLabel: t("مركز العمليات", "Operations Center"), available: view === "operations" || canViewOperations, content: <OperationsView conversations={conversations} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> },
          { viewKey: "reports", label: t("التقارير", "Reports"), available: view === "reports" || canViewReports, content: <ReportsView conversations={conversations} employees={employees} teams={teams} workSchedules={workSchedules} onOpenConversation={onOpenConversation} /> }
        ]}
      />
    );
  }
  if (view === "contacts" || view === "tags" || view === "pipeline") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel={t("العملاء والعملاء المحتملون والوسوم", "Customers, leads and tags")}
        tabs={[
          { viewKey: "contacts", label: t("العملاء", "Customers"), available: view === "contacts" || canViewContacts, content: <ContactsView customers={customers} tagList={tags} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> },
          { viewKey: "pipeline", label: t("العملاء المحتملون", "Leads"), available: view === "pipeline" || canViewPipeline, content: <PipelineView conversations={conversations} automationRules={automationRules} templates={templates} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> },
          { viewKey: "tags", label: t("الوسوم", "Tags"), available: view === "tags" || canViewTags, content: <TagsView conversations={conversations} tags={tags} onOpenConversation={onOpenConversation} onRefreshData={onRefreshData} /> }
        ]}
      />
    );
  }
  if (view === "bot" || view === "automations") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel={t("الرد الآلي والأتمتة", "Auto reply and automations")}
        tabs={[
          { viewKey: "bot", label: t("الرد الآلي", "Auto reply"), available: view === "bot" || canViewBot, content: <BotView teams={teams} employees={employees} /> },
          { viewKey: "automations", label: t("الأتمتة", "Automations"), available: view === "automations" || canViewAutomations, content: <AutomationsView automationRules={automationRules} employees={employees} tags={tags} teams={teams} templates={templates} onRefreshData={onRefreshData} /> }
        ]}
      />
    );
  }
  if (view === "ai" || view === "knowledgeBase") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel={t("مساعد AI وقاعدة المعرفة", "AI assistant and knowledge base")}
        note={<p className="muted-copy" style={{ margin: "10px 24px 0" }}>{t("المساعد وخطوة «رد AI تلقائي» لا يجيبان إلا من قاعدة المعرفة، فأضف فيها أسئلتك وأجوبتك أولًا.", "The assistant and the \"Automatic AI reply\" step only answer from the knowledge base, so add your questions and answers there first.")}</p>}
        tabs={[
          { viewKey: "knowledgeBase", label: t("قاعدة المعرفة", "Knowledge Base"), available: view === "knowledgeBase" || canViewKnowledgeBase, content: <KnowledgeBaseView /> },
          { viewKey: "ai", label: t("إعدادات المساعد", "Assistant settings"), available: view === "ai" || canViewAi, content: <AiSettingsView /> }
        ]}
      />
    );
  }
  if (view === "campaigns" || view === "emailPromotions" || view === "segments") {
    return (
      <ViewTabs
        initialKey={view === "segments" ? "campaigns" : view}
        className="channel-switch"
        ariaLabel={t("الحملات والعروض البريدية", "Campaigns and email promotions")}
        tabs={[
          { viewKey: "campaigns", label: t("حملات واتساب", "WhatsApp campaigns"), available: view === "campaigns" || view === "segments" || canViewCampaigns, content: <CampaignsHub channel="whatsapp" tags={tags} initialSection={view === "segments" ? "segments" : "list"} list={<CampaignsView campaigns={campaigns} templates={templates} whatsappConnected={whatsappConnected} brandName={branding.name} onRefreshData={onRefreshData} />} /> },
          { viewKey: "emailPromotions", label: t("العروض البريدية", "Email promotions"), available: view === "emailPromotions" || canViewEmailPromotions, content: <CampaignsHub channel="email" tags={tags} list={<EmailPromotionsView customers={customers} conversations={conversations} tags={tags} />} /> }
        ]}
      />
    );
  }
  if (view === "templates") return <TemplatesView templates={templates} whatsappConnected={whatsappConnected} onRefreshData={onRefreshData} />;
  if (view === "quickReplies") return <QuickRepliesView quickReplies={quickReplies} teams={teams} onRefreshData={onRefreshData} />;
  if (view === "teams" || view === "employees" || view === "workHours") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel={t("الموظفون والفرق", "Employees and teams")}
        tabs={[
          { viewKey: "employees", label: t("الموظفون والصلاحيات", "Employees & permissions"), available: view === "employees" || canViewEmployees, content: <EmployeesView employees={employees} conversations={conversations} teams={teams} onRefreshData={onRefreshData} /> },
          { viewKey: "teams", label: t("الفرق", "Teams"), available: view === "teams" || canViewTeams, content: <TeamsView employees={employees} teams={teams} onRefreshData={onRefreshData} /> },
          { viewKey: "workHours", label: t("ساعات العمل", "Work hours"), available: view === "workHours" || canViewWorkHours, content: <WorkHoursView teams={teams} workSchedules={workSchedules} onRefreshData={onRefreshData} /> }
        ]}
      />
    );
  }
  if (view === "settings" || view === "integrations" || view === "developers" || view === "branding") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel={t("الإعدادات والربط", "Settings and connections")}
        tabs={[
          { viewKey: "settings", label: t("القنوات", "Channels"), available: view === "settings" || canViewSettings, content: <SettingsView onIntegrationChange={onIntegrationChange} /> },
          { viewKey: "integrations", label: t("التكاملات", "Integrations"), available: view === "integrations" || canViewIntegrations, content: <IntegrationsView /> },
          { viewKey: "developers", label: t("المطورون", "Developers"), available: view === "developers" || canViewDevelopers, content: <DevelopersView /> },
          { viewKey: "branding", label: t("العلامة التجارية", "Branding"), available: view === "branding" || canViewBranding, content: <BrandingView onRefreshData={onRefreshData} /> }
        ]}
      />
    );
  }
  if (view === "catalog" || view === "branches") {
    return (
      <ViewTabs
        initialKey={view}
        ariaLabel={t("الكتالوج والفروع", "Catalog and branches")}
        tabs={[
          { viewKey: "catalog", label: t("الكتالوج", "Catalog"), available: view === "catalog" || canViewCatalog, content: <CatalogView /> },
          { viewKey: "branches", label: t("الفروع", "Branches"), available: view === "branches" || canViewBranches, content: <BranchesView /> }
        ]}
      />
    );
  }
  return null;
}
