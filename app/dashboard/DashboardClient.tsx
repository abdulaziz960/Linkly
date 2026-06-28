"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import DashboardSidebar from "./components/DashboardSidebar";
import MobileTopbar from "./components/MobileTopbar";
import { initialConversations } from "./data/conversations";
import { employees as initialEmployees } from "./data/employees";
import { navItems, viewTitles } from "./data/navigation";
import { tags as initialTags } from "./data/tags";
import { teams as initialTeams } from "./data/teams";
import { templates as initialTemplates } from "./data/templates";
import { quickReplies as initialQuickReplies } from "./data/quickReplies";
import { automationRules as initialAutomationRules } from "./data/automations";
import { campaigns as initialCampaigns } from "./data/campaigns";
import { workSchedules as initialWorkSchedules } from "./data/workHours";
import { leads as initialLeads } from "./data/leads";
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

export default function DashboardClient({ initialUser }: DashboardClientProps) {
  const [activeView, setActiveView] = useState<ViewKey>("inbox");
  const [conversations, setConversations] = useState(initialConversations);
  const [customers, setCustomers] = useState<Customer[]>(
    initialConversations.map((conversation) => ({
      id: conversation.id,
      name: conversation.customer,
      phone: conversation.phone,
      initial: conversation.initial,
      tags: conversation.tags
    }))
  );
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [templates, setTemplates] = useState<MessageTemplate[]>(initialTemplates);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(initialQuickReplies);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>(initialAutomationRules);
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>(initialWorkSchedules);
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [activeConversationId, setActiveConversationId] = useState(initialConversations[0].id);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const [chatPanel, setChatPanel] = useState<ChatPanel>("chat");
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplates[0].name);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePanel, setProfilePanel] = useState<"main" | "billing" | "security">("main");

  const currentEmployee =
    (initialUser.role === "مالك الحساب"
      ? employees.find((employee) => employee.id === "emp-owner")
      : employees.find((employee) => employee.email.toLowerCase() === initialUser.email.toLowerCase())) ?? employees[0];
  const canViewAllConversations = canSeeAllConversations(initialUser, currentEmployee);
  const scopedConversations = useMemo(() => {
    if (canViewAllConversations) return conversations;

    return conversations.filter(
      (conversation) => conversation.assignee === currentEmployee.name && conversation.status === "assigned"
    );
  }, [canViewAllConversations, conversations, currentEmployee.name]);
  const activeConversation =
    scopedConversations.find((conversation) => conversation.id === activeConversationId) ??
    scopedConversations[0] ??
    conversations[0];
  const currentProfileStatus = currentEmployee?.status === "غير متصل" ? "غير متصل" : "متصل";
  const accountInitial = getNameInitial(initialUser.name);
  const allowedViews = useMemo(() => getAllowedViews(initialUser, currentEmployee), [currentEmployee, initialUser]);

  async function fetchData<T>(path: string) {
    const response = await fetch(path);
    if (!response.ok) return null;

    const payload = (await response.json()) as { ok: boolean; data?: T };
    return payload.ok && payload.data ? payload.data : null;
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

      if (nextConversations?.length) {
        setConversations(nextConversations);
        setActiveConversationId((currentId) =>
          nextConversations.some((conversation) => conversation.id === currentId) ? currentId : nextConversations[0].id
        );
      }
      if (nextCustomers?.length) setCustomers(nextCustomers);
      if (nextEmployees?.length) setEmployees(nextEmployees);
      if (nextTeams?.length) setTeams(nextTeams);
      if (nextTags) setTags(nextTags);
      if (nextTemplates?.length) {
        setTemplates(nextTemplates);
        setSelectedTemplate((currentTemplate) =>
          nextTemplates.some((template) => template.name === currentTemplate) ? currentTemplate : nextTemplates[0].name
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
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (!allowedViews.includes(activeView)) {
      setActiveView(allowedViews[0] ?? "inbox");
    }
  }, [activeView, allowedViews]);

  useEffect(() => {
    if (!canViewAllConversations && filter !== "assigned") {
      setFilter("assigned");
    }
  }, [canViewAllConversations, filter]);

  useEffect(() => {
    if (!scopedConversations.length) return;

    if (!scopedConversations.some((conversation) => conversation.id === activeConversationId)) {
      setActiveConversationId(scopedConversations[0].id);
    }
  }, [activeConversationId, scopedConversations]);

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
    setConversations((current) =>
      current.map((conversation) => (conversation.id === nextConversation.id ? nextConversation : conversation))
    );
  }

  function handleViewChange(view: ViewKey) {
    if (!allowedViews.includes(view)) return;

    setActiveView(view);
    setMenuOpen(false);
  }

  function handleOpenConversation(conversationId: string) {
    if (!allowedViews.includes("inbox")) return;
    if (!canViewAllConversations && !scopedConversations.some((conversation) => conversation.id === conversationId)) return;

    setActiveConversationId(conversationId);
    setActiveView("inbox");
    setChatPanel("chat");
    setMobileChatOpen(true);
  }

  async function handleAssigneeChange(assignee: string) {
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
    if (!message.trim() || activeConversation.windowExpired) return;

    const nextMessage: Conversation["messages"][number] = {
      id: `m-${Date.now()}`,
      direction: composerMode === "note" ? "note" : "out",
      text: message.trim(),
      time: "الآن"
    };

    updateConversation({
      ...activeConversation,
      lastMessage: nextMessage.text,
      messages: [...activeConversation.messages, nextMessage]
    });
    setMessage("");

    await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: composerMode === "note" ? "note" : "out",
        text: nextMessage.text
      })
    });
    await loadDashboardData();
  }

  async function handleSendTemplate() {
    const template = templates.find((item) => item.name === selectedTemplate) ?? templates[0];
    updateConversation({
      ...activeConversation,
      lastMessage: template.message,
      messages: [
        ...activeConversation.messages,
        {
          id: `m-${Date.now()}`,
          direction: "out",
          text: template.message,
          time: "الآن"
        }
      ]
    });

    await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "out",
        text: template.message,
        forceWindowExpired: true
      })
    });
    await loadDashboardData();
  }

  function handleSendAttachment(attachment: MessageAttachment) {
    if (activeConversation.windowExpired) return;

    const nextMessage: Conversation["messages"][number] = {
      id: `m-${Date.now()}`,
      direction: "out",
      text: attachment.type === "image" ? `صورة: ${attachment.name}` : `تسجيل صوتي: ${attachment.name}`,
      time: "الآن",
      attachment
    };

    updateConversation({
      ...activeConversation,
      lastMessage: attachment.type === "image" ? "تم إرسال صورة" : "تم إرسال تسجيل صوتي",
      messages: [...activeConversation.messages, nextMessage]
    });
  }

  async function handleDeleteMessage(messageId: string) {
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
            visibleConversations={visibleConversations}
            onChangeAssignee={handleAssigneeChange}
            onChangeChatPanel={setChatPanel}
            onChangeComposerMode={setComposerMode}
            onChangeFilter={setFilter}
            onChangeMessage={setMessage}
            onChangeSearch={setConversationSearch}
            onChangeSelectedConversation={setActiveConversationId}
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
            conversations={conversations}
            customers={customers}
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
                      <span>{initialUser.role} · موقع الماجدية</span>
                      <em className={currentProfileStatus === "متصل" ? "online" : "offline"}>{currentProfileStatus}</em>
                    </div>
                  </div>
                  <div className="account-info-grid">
                    <div><span>البريد الإلكتروني</span><b>{initialUser.email}</b></div>
                    <div><span>الدور</span><b>{initialUser.role}</b></div>
                    <div><span>الباقة</span><b>باقة النمو</b></div>
                    <div><span>حالة الربط</span><b>WhatsApp Cloud API متصل</b></div>
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
