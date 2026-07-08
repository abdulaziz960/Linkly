"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import DashboardSidebar from "./components/DashboardSidebar";
import MobileTopbar from "./components/MobileTopbar";
import { navItems, viewTitles } from "./data/navigation";
import { formatMessageTime } from "../../lib/time";
import type {
  AutomationRule,
  Campaign,
  ChatPanel,
  ComposerMode,
  Conversation,
  ConversationFilter,
  Customer,
  DashboardUser,
  Employee,
  Lead,
  MessageAttachment,
  MessageTemplate,
  QuickReply,
  Tag,
  Team,
  ViewKey,
  WorkSchedule
} from "./types";
import DashboardViewRouter from "./views/DashboardViewRouter";
import InboxView from "./views/InboxView";

type DashboardClientProps = {
  initialUser: DashboardUser;
};

function getNameInitial(name: string) {
  return name.trim().charAt(0) || "ع";
}

async function readApiError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || "تعذر تنفيذ العملية";
}

const allViewKeys: ViewKey[] = navItems.map((item) => item.key);

const permissionViewMap: Array<{ keyword: string; views: ViewKey[] }> = [
  { keyword: "محادثات", views: ["inbox"] },
  { keyword: "عملاء", views: ["contacts"] },
  { keyword: "وسوم", views: ["tags"] },
  { keyword: "قوالب", views: ["templates"] },
  { keyword: "ردود", views: ["quickReplies"] },
  { keyword: "رد آلي", views: ["bot"] },
  { keyword: "أتمتة", views: ["automations"] },
  { keyword: "حملات", views: ["campaigns"] },
  { keyword: "ساعات", views: ["workHours"] },
  { keyword: "تقارير", views: ["reports"] },
  { keyword: "محتملون", views: ["leads"] },
  { keyword: "فرق", views: ["teams"] },
  { keyword: "موظفين", views: ["employees"] },
  { keyword: "صلاحيات", views: ["employees"] },
  { keyword: "ربط", views: ["settings"] }
];

function getAllowedViews(user: DashboardUser, employee?: Employee): ViewKey[] {
  const permissions = employee?.permissions ?? "";

  if (user.role === "مالك الحساب" || permissions === "الكل") {
    return allViewKeys;
  }

  const views = new Set<ViewKey>();

  permissionViewMap.forEach((permission) => {
    if (permissions.includes(permission.keyword)) {
      permission.views.forEach((view) => views.add(view));
    }
  });

  return views.size ? Array.from(views) : ["inbox"];
}

function canSeeAllConversations(user: DashboardUser, employee?: Employee) {
  return user.role === "مالك الحساب" || employee?.permissions === "الكل";
}

function isApprovedMarketingTemplate(template: MessageTemplate) {
  return (
    template.status === "معتمد" &&
    template.type !== "خدمة" &&
    (template.category === "MARKETING" || template.type === "تسويق")
  );
}

const emptyConversation: Conversation = {
  id: "",
  customer: "لا توجد محادثة",
  phone: "",
  initial: "-",
  lastMessage: "",
  status: "closed",
  assignee: "بدون موظف",
  tags: [],
  messages: []
};

const CONVERSATIONS_CACHE_KEY = "audiencew:dashboard-conversations";
const CUSTOMERS_CACHE_KEY = "audiencew:dashboard-customers";

function writeCachedList<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The dashboard can keep working even if browser storage is unavailable.
  }
}

export default function DashboardClient({ initialUser }: DashboardClientProps) {
  const [activeView, setActiveView] = useState<ViewKey>("inbox");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const [chatPanel, setChatPanel] = useState<ChatPanel>("chat");
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePanel, setProfilePanel] = useState<"main" | "billing" | "security">("main");

  const fallbackEmployee: Employee = {
    id: initialUser.id,
    name: initialUser.name,
    role: initialUser.role === "مالك الحساب" || initialUser.role === "مشرف" ? initialUser.role : "موظف دعم",
    status: "متصل",
    permissions: initialUser.role === "مالك الحساب" ? "الكل" : "",
    email: initialUser.email,
    initial: getNameInitial(initialUser.name)
  };
  const currentEmployee =
    (initialUser.role === "مالك الحساب"
      ? employees.find((employee) => employee.id === "emp-owner")
      : employees.find((employee) => employee.email.toLowerCase() === initialUser.email.toLowerCase())) ?? fallbackEmployee;
  const canViewAllConversations = canSeeAllConversations(initialUser, currentEmployee);
  const approvedMarketingTemplates = useMemo(() => templates.filter(isApprovedMarketingTemplate), [templates]);
  const scopedConversations = useMemo(() => {
    if (canViewAllConversations) return conversations;

    return conversations.filter(
      (conversation) =>
        conversation.assignee === currentEmployee.name &&
        (conversation.status === "assigned" || conversation.status === "closed")
    );
  }, [canViewAllConversations, conversations, currentEmployee.name]);
  const scopedCustomers = useMemo<Customer[]>(() => {
    if (canViewAllConversations) return customers;

    const allowedCustomerIds = new Set(scopedConversations.map((conversation) => conversation.id));
    return customers.filter((customer) => allowedCustomerIds.has(customer.id));
  }, [canViewAllConversations, customers, scopedConversations]);
  const activeConversation =
    scopedConversations.find((conversation) => conversation.id === activeConversationId) ??
    emptyConversation;
  const activeConversationSnapshot = {
    id: activeConversation.id,
    customer: activeConversation.customer,
    phone: activeConversation.phone,
    initial: activeConversation.initial,
    assignee: activeConversation.assignee,
    status: activeConversation.status
  };
  const currentProfileStatus = currentEmployee?.status === "غير متصل" ? "غير متصل" : "متصل";
  const accountInitial = getNameInitial(initialUser.name);
  const allowedViews = useMemo(() => getAllowedViews(initialUser, currentEmployee), [currentEmployee, initialUser]);
  const canReopenConversations = canViewAllConversations || currentEmployee.role === "مشرف";

  async function fetchData<T>(path: string) {
    const response = await fetch(path);
    if (!response.ok) return null;

    const payload = (await response.json()) as { ok: boolean; data?: T };
    return payload.ok && payload.data !== undefined ? payload.data : null;
  }

  async function loadDashboardData() {
    try {
      const [
        nextConversations,
        nextCustomers,
        nextEmployees,
        nextTeams,
        nextTags,
        nextTemplates,
        nextQuickReplies,
        nextAutomationRules,
        nextCampaigns,
        nextWorkSchedules,
        nextLeads
      ] = await Promise.all([
        fetchData<Conversation[]>("/api/conversations"),
        fetchData<Customer[]>("/api/customers"),
        fetchData<Employee[]>("/api/employees"),
        fetchData<Team[]>("/api/teams"),
        fetchData<Tag[]>("/api/tags"),
        fetchData<MessageTemplate[]>("/api/templates"),
        fetchData<QuickReply[]>("/api/quick-replies"),
        fetchData<AutomationRule[]>("/api/automations"),
        fetchData<Campaign[]>("/api/campaigns"),
        fetchData<WorkSchedule[]>("/api/work-hours"),
        fetchData<Lead[]>("/api/leads")
      ]);

      if (nextConversations) {
        writeCachedList(CONVERSATIONS_CACHE_KEY, nextConversations);
        setConversations(nextConversations);
        setActiveConversationId((currentId) =>
          currentId && nextConversations.some((conversation) => conversation.id === currentId)
            ? currentId
            : ""
        );
      }
      if (nextCustomers) {
        writeCachedList(CUSTOMERS_CACHE_KEY, nextCustomers);
        setCustomers(nextCustomers);
      }
      if (nextEmployees?.length) setEmployees(nextEmployees);
      if (nextTeams?.length) setTeams(nextTeams);
      if (nextTags) setTags(nextTags);
      if (nextTemplates?.length) {
        setTemplates(nextTemplates);
        setSelectedTemplate((currentTemplate) =>
          nextTemplates.some((template) => template.name === currentTemplate && isApprovedMarketingTemplate(template))
            ? currentTemplate
            : nextTemplates.find(isApprovedMarketingTemplate)?.name || nextTemplates[0].name
        );
      }
      if (nextQuickReplies) setQuickReplies(nextQuickReplies);
      if (nextAutomationRules) setAutomationRules(nextAutomationRules);
      if (nextCampaigns) setCampaigns(nextCampaigns);
      if (nextWorkSchedules) setWorkSchedules(nextWorkSchedules);
      if (nextLeads) setLeads(nextLeads);
    } catch {
      // Keep local fallback data visible if the API is temporarily unavailable.
    }
  }

  useEffect(() => {
    window.localStorage.removeItem(CONVERSATIONS_CACHE_KEY);
    window.localStorage.removeItem(CUSTOMERS_CACHE_KEY);

    loadDashboardData();
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void loadDashboardData();
      }
    };

    const intervalId = window.setInterval(refreshWhenVisible, 3000);

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    writeCachedList(CONVERSATIONS_CACHE_KEY, conversations);
  }, [conversations]);

  useEffect(() => {
    writeCachedList(CUSTOMERS_CACHE_KEY, customers);
  }, [customers]);

  useEffect(() => {
    if (!allowedViews.includes(activeView)) {
      setActiveView(allowedViews[0] ?? "inbox");
    }
  }, [activeView, allowedViews]);

  useEffect(() => {
    if (!canViewAllConversations && filter !== "assigned" && filter !== "closed") {
      setFilter("assigned");
    }
  }, [canViewAllConversations, filter]);

  useEffect(() => {
    if (activeConversationId && !scopedConversations.some((conversation) => conversation.id === activeConversationId)) {
      setActiveConversationId("");
    }
  }, [activeConversationId, scopedConversations]);

  useEffect(() => {
    const clearActiveConversation = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || activeView !== "inbox" || !activeConversationId) return;

      setActiveConversationId("");
      setChatPanel("chat");
      setMobileChatOpen(false);
    };

    window.addEventListener("keydown", clearActiveConversation);

    return () => {
      window.removeEventListener("keydown", clearActiveConversation);
    };
  }, [activeConversationId, activeView]);

  useEffect(() => {
    if (!approvedMarketingTemplates.length) return;
    if (!approvedMarketingTemplates.some((template) => template.name === selectedTemplate)) {
      setSelectedTemplate(approvedMarketingTemplates[0].name);
    }
  }, [approvedMarketingTemplates, selectedTemplate]);

  const counts = useMemo<Record<ConversationFilter, number>>(() => {
    return {
      all: scopedConversations.length,
      assigned: scopedConversations.filter((conversation) => conversation.status === "assigned").length,
      unassigned: scopedConversations.filter((conversation) => conversation.status === "unassigned").length,
      closed: scopedConversations.filter((conversation) => conversation.status === "closed").length
    };
  }, [scopedConversations]);

  const visibleConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    return scopedConversations.filter((conversation) => {
      const matchesFilter = filter === "all" || conversation.status === filter;
      const matchesSearch = query
        ? [conversation.customer, conversation.phone, conversation.lastMessage, conversation.assignee, ...conversation.tags]
            .join(" ")
            .toLowerCase()
            .includes(query)
        : true;

      return matchesFilter && matchesSearch;
    });
  }, [conversationSearch, scopedConversations, filter]);

  function updateConversation(nextConversation: Conversation) {
    setConversations((current) => {
      const nextConversations = current.map((conversation) =>
        conversation.id === nextConversation.id ? nextConversation : conversation
      );

      writeCachedList(CONVERSATIONS_CACHE_KEY, nextConversations);
      return nextConversations;
    });
  }

  function handleViewChange(view: ViewKey) {
    if (!allowedViews.includes(view)) return;

    setActiveView(view);
    setMenuOpen(false);
  }

  function handleOpenConversation(conversationId: string) {
    if (!allowedViews.includes("inbox")) return;
    const conversation = scopedConversations.find((item) => item.id === conversationId);
    if (!canViewAllConversations && !conversation) return;

    setActiveConversationId(conversationId);
    setActiveView("inbox");
    setChatPanel("chat");
    setMobileChatOpen(true);

    if (conversation?.unread) {
      updateConversation({ ...conversation, unread: undefined });
      void fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unread: 0 })
      });
    }
  }

  async function handleAssigneeChange(assignee: string) {
    if (!activeConversation.id) return;

    const status = assignee === "بدون موظف" ? "unassigned" : "assigned";
    updateConversation({
      ...activeConversation,
      assignee,
      status
    });

    await fetch(`/api/conversations/${activeConversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee, status })
    });
    await loadDashboardData();
  }

  async function handleConversationStatusToggle() {
    if (!activeConversation.id) return;
    if (activeConversation.status === "closed" && !canReopenConversations) return;

    const status = activeConversation.status === "closed" ? "assigned" : "closed";
    updateConversation({
      ...activeConversation,
      status
    });

    await fetch(`/api/conversations/${activeConversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    await loadDashboardData();
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation.id) return;
    const text = message.trim();
    const direction = composerMode === "note" ? "note" : "out";
    if (!text || activeConversation.status === "closed") return;
    if (activeConversation.windowExpired && direction !== "note") return;

    const response = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction,
        text,
        conversation: activeConversationSnapshot
      })
    });

    if (!response.ok) {
      window.alert(await readApiError(response));
      return;
    }

    setMessage("");
    await loadDashboardData();
  }

  async function handleSendTemplate() {
    if (!activeConversation.id) return;
    if (activeConversation.status === "closed") return;

    const template =
      approvedMarketingTemplates.find((item) => item.name === selectedTemplate) ?? approvedMarketingTemplates[0];
    if (!template) {
      window.alert("لا توجد قوالب تسويقية معتمدة متاحة للإرسال.");
      return;
    }

    const response = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "out",
        text: template.message,
        messageType: "template",
        templateName: template.name,
        templateLanguage: template.language || "ar",
        forceWindowExpired: true,
        conversation: activeConversationSnapshot
      })
    });

    if (!response.ok) {
      window.alert(await readApiError(response));
      return;
    }

    await loadDashboardData();
  }

  function handleSendAttachment(attachment: MessageAttachment) {
    if (!activeConversation.id) return;
    if (activeConversation.windowExpired || activeConversation.status === "closed") return;

    const nextMessage: Conversation["messages"][number] = {
      id: `m-${Date.now()}`,
      direction: "out",
      text: attachment.type === "image" ? `صورة: ${attachment.name}` : `تسجيل صوتي: ${attachment.name}`,
      time: formatMessageTime(),
      author: initialUser.name,
      attachment
    };

    updateConversation({
      ...activeConversation,
      lastMessage: attachment.type === "image" ? "تم إرسال صورة" : "تم إرسال تسجيل صوتي",
      messages: [...activeConversation.messages, nextMessage]
    });
  }

  async function handleDeleteMessage(messageId: string) {
    if (!activeConversation.id) return;

    updateConversation({
      ...activeConversation,
      lastMessage: "تم حذف هذه الرسالة",
      messages: activeConversation.messages.map((item) =>
        item.id === messageId ? { ...item, text: "تم حذف هذه الرسالة" } : item
      )
    });

    await fetch(`/api/conversations/${activeConversation.id}/messages/${messageId}`, {
      method: "DELETE"
    });
    await loadDashboardData();
  }

  async function handleProfileStatusToggle() {
    if (!currentEmployee) return;
    const nextStatus: Employee["status"] = currentProfileStatus === "متصل" ? "غير متصل" : "متصل";
    const nextEmployee = { ...currentEmployee, status: nextStatus };

    setEmployees((current) =>
      current.map((employee) => (employee.id === currentEmployee.id ? nextEmployee : employee))
    );

    await fetch(`/api/employees/${currentEmployee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextEmployee.name,
        email: nextEmployee.email,
        role: nextEmployee.role,
        status: nextEmployee.status,
        permissions: nextEmployee.permissions
      })
    });
    await loadDashboardData();
  }

  return (
    <div className={`dashboard-shell ${menuOpen ? "menu-open" : ""}`}>
      <DashboardSidebar
        activeView={activeView}
        allowedViews={allowedViews}
        user={initialUser}
        profileStatus={currentProfileStatus}
        onChangeView={handleViewChange}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <main className="dashboard-main">
        <MobileTopbar title={viewTitles[activeView]} onToggleMenu={() => setMenuOpen((value) => !value)} />

        {activeView === "inbox" ? (
          <InboxView
            activeConversation={activeConversation}
            assigneeOptions={[...employees.map((employee) => employee.name), "بدون موظف"]}
            canChangeAssignee={canViewAllConversations}
            canDeleteAnyMessage={canViewAllConversations}
            canReopenConversation={canReopenConversations}
            chatPanel={chatPanel}
            composerMode={composerMode}
            conversations={scopedConversations}
            counts={counts}
            filter={filter}
            assignedOnly={!canViewAllConversations}
            message={message}
            search={conversationSearch}
            mobileChatOpen={mobileChatOpen}
            selectedTemplate={selectedTemplate}
            templates={templates}
            currentUserName={initialUser.name}
            visibleConversations={visibleConversations}
            onChangeAssignee={handleAssigneeChange}
            onChangeChatPanel={setChatPanel}
            onChangeComposerMode={setComposerMode}
            onChangeFilter={setFilter}
            onChangeMessage={setMessage}
            onChangeSearch={setConversationSearch}
            onChangeSelectedConversation={handleOpenConversation}
            onChangeSelectedTemplate={setSelectedTemplate}
            onCloseConversation={handleConversationStatusToggle}
            onDeleteMessage={handleDeleteMessage}
            onSend={handleSend}
            onSendAttachment={handleSendAttachment}
            onSendTemplate={handleSendTemplate}
            onSetMobileChatOpen={setMobileChatOpen}
          />
        ) : (
          <DashboardViewRouter
            conversations={scopedConversations}
            customers={scopedCustomers}
            employees={employees}
            quickReplies={quickReplies}
            automationRules={automationRules}
            campaigns={campaigns}
            workSchedules={workSchedules}
            leads={leads}
            tags={tags}
            teams={teams}
            templates={templates}
            onRefreshData={loadDashboardData}
            onOpenConversation={handleOpenConversation}
            view={activeView}
          />
        )}
      </main>

      {profileOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setProfileOpen(false)}>
          <section className="account-modal" role="dialog" aria-modal="true" aria-label="الملف الشخصي" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setProfileOpen(false)}>
                ×
              </button>
              <h2>{profilePanel === "billing" ? "الفواتير والاشتراك" : profilePanel === "security" ? "الأمان" : "الملف الشخصي"}</h2>
            </header>
            <div className="account-modal-body">
              {profilePanel === "main" ? (
                <>
                  <div className="account-summary">
                    <span className="account-avatar large">{accountInitial}</span>
                    <div>
                      <b>{initialUser.name}</b>
                      <span>{initialUser.role}</span>
                      <em className={currentProfileStatus === "متصل" ? "online" : "offline"}>{currentProfileStatus}</em>
                    </div>
                  </div>
                  <div className="account-info-grid">
                    <div><span>البريد الإلكتروني</span><b>{initialUser.email}</b></div>
                    <div><span>الدور</span><b>{initialUser.role}</b></div>
                    <div><span>الباقة</span><b>لم يتم تحديد الباقة</b></div>
                    <div><span>حالة الربط</span><b>لم يتم الربط بعد</b></div>
                  </div>
                  <div className="profile-actions">
                    <button
                      className="btn soft"
                      type="button"
                      onClick={handleProfileStatusToggle}
                    >
                      تغيير الحالة
                    </button>
                    <button className="btn soft" type="button" onClick={() => setProfilePanel("billing")}>الفواتير والاشتراك</button>
                    <button className="btn soft" type="button" onClick={() => setProfilePanel("security")}>الأمان</button>
                    <button className="btn danger" type="button" onClick={() => {
                      if (window.confirm("هل تريد تسجيل الخروج من لوحة AudienceW؟")) {
                        setProfileOpen(false);
                        fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                          window.location.href = "/login";
                        });
                      }
                    }}>تسجيل الخروج</button>
                  </div>
                </>
              ) : profilePanel === "billing" ? (
                <div className="profile-detail-panel">
                  <div><span>الباقة الحالية</span><b>باقة النمو</b></div>
                  <div><span>حالة الاشتراك</span><b>نشط</b></div>
                  <div><span>تجديد الاشتراك</span><b>شهري</b></div>
                  <div><span>رصيد الحملات</span><b>336 رسالة متاحة</b></div>
                  <p className="muted-copy">تظهر هنا بيانات الاشتراك والفواتير ورصيد الحملات المرتبط بالحساب.</p>
                </div>
              ) : (
                <div className="profile-detail-panel">
                  <div><span>تسجيل الدخول</span><b>البريد الإلكتروني وكلمة المرور</b></div>
                  <div><span>التحقق الثنائي</span><b>غير مفعل</b></div>
                  <div><span>آخر دخول</span><b>اليوم · الرياض</b></div>
                  <div><span>الصلاحيات</span><b>{initialUser.role}</b></div>
                  <p className="muted-copy">تظهر هنا إعدادات الحماية، الجلسات، والتحقق الثنائي عند ربط نظام الدخول الحقيقي.</p>
                </div>
              )}
            </div>
            <footer className="modal-foot">
              {profilePanel === "main" ? null : <button className="btn soft" type="button" onClick={() => setProfilePanel("main")}>رجوع</button>}
              <button className="btn soft" type="button" onClick={() => { setProfileOpen(false); setProfilePanel("main"); }}>إلغاء</button>
              <button className="btn primary" type="button" onClick={() => setProfileOpen(false)}>حفظ</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
