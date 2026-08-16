"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardSidebar from "./components/DashboardSidebar";
import MobileTopbar from "./components/MobileTopbar";
import { navItems, viewTitles } from "./data/navigation";
import type {
  AutomationRule,
  Campaign,
  ChatPanel,
  ComposerMode,
  Conversation,
  ConversationChannel,
  ConversationChannelFilter,
  ConversationFilter,
  Customer,
  DashboardUser,
  Employee,
  IntegrationSettings,
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

function isApprovedTemplate(template: MessageTemplate) {
  return template.status === "معتمد";
}

const emptyConversation: Conversation = {
  id: "",
  channel: "whatsapp",
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
const DASHBOARD_VIEW_KEY = "audiencew:dashboard-active-view";
const DASHBOARD_CHANNEL_KEY = "audiencew:dashboard-active-channel";
const conversationChannels: ConversationChannel[] = ["whatsapp", "instagram", "x", "facebook", "google_maps", "website", "telegram", "email", "tiktok"];

function isViewKey(value: string | null): value is ViewKey {
  return !!value && allViewKeys.includes(value as ViewKey);
}

function isConversationChannel(value: string | null): value is ConversationChannel {
  return !!value && conversationChannels.includes(value as ConversationChannel);
}

function writeCachedList<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The dashboard can keep working even if browser storage is unavailable.
  }
}

export default function DashboardClient({ initialUser }: DashboardClientProps) {
  const restoredNavigationRef = useRef(false);
  const loadDashboardDataSeqRef = useRef(0);
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
  const [selectedChannel, setSelectedChannel] = useState<ConversationChannelFilter>("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const [chatPanel, setChatPanel] = useState<ChatPanel>("chat");
  const [composerMode, setComposerMode] = useState<ComposerMode>("reply");
  const [message, setMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePanel, setProfilePanel] = useState<"main" | "billing" | "security">("main");
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationSettings["status"]>("pending");
  const [instagramStatus, setInstagramStatus] = useState<IntegrationSettings["status"]>("pending");
  const [facebookStatus, setFacebookStatus] = useState<IntegrationSettings["status"]>("pending");
  const [telegramStatus, setTelegramStatus] = useState<IntegrationSettings["status"]>("pending");
  const [xStatus, setXStatus] = useState<IntegrationSettings["status"]>("pending");
  const [googleMapsStatus, setGoogleMapsStatus] = useState<IntegrationSettings["status"]>("pending");
  const [emailStatus, setEmailStatus] = useState<IntegrationSettings["status"]>("pending");

  const handleIntegrationChange = useCallback((settings: IntegrationSettings) => {
    if (settings.provider === "instagram" || settings.id === "meta-instagram") {
      setInstagramStatus(settings.status);
      return;
    }

    if (settings.provider === "telegram" || settings.id === "telegram-bot") {
      setTelegramStatus(settings.status);
      return;
    }

    if (settings.provider === "facebook" || settings.id === "meta-facebook") {
      setFacebookStatus(settings.status);
      return;
    }

    if (settings.provider === "x" || settings.id === "x-channel") {
      setXStatus(settings.status);
      return;
    }

    if (settings.provider === "google_maps" || settings.id === "google-maps") {
      setGoogleMapsStatus(settings.status);
      return;
    }

    if (settings.provider === "email" || settings.id === "email-channel") {
      setEmailStatus(settings.status);
      return;
    }

    setIntegrationStatus(settings.status);
  }, []);

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
  const approvedTemplates = useMemo(() => templates.filter(isApprovedTemplate), [templates]);
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
  const channelFilteredConversations = useMemo(() => {
    if (selectedChannel === "all") return scopedConversations;

    return scopedConversations.filter((conversation) => (conversation.channel || "whatsapp") === selectedChannel);
  }, [scopedConversations, selectedChannel]);

  useEffect(() => {
    fetch("/api/settings/integration")
      .then((response) => response.json())
      .then((settings: IntegrationSettings) => setIntegrationStatus(settings.status))
      .catch(() => setIntegrationStatus("pending"));
    fetch("/api/settings/integration?channel=instagram")
      .then((response) => response.json())
      .then((settings: IntegrationSettings) => setInstagramStatus(settings.status))
      .catch(() => setInstagramStatus("pending"));
    fetch("/api/settings/integration?channel=facebook")
      .then((response) => response.json())
      .then((settings: IntegrationSettings) => setFacebookStatus(settings.status))
      .catch(() => setFacebookStatus("pending"));
    fetch("/api/settings/integration?channel=telegram")
      .then((response) => response.json())
      .then((settings: IntegrationSettings) => setTelegramStatus(settings.status))
      .catch(() => setTelegramStatus("pending"));
    fetch("/api/settings/integration?channel=x")
      .then((response) => response.json())
      .then((settings: IntegrationSettings) => setXStatus(settings.status))
      .catch(() => setXStatus("pending"));
    fetch("/api/settings/integration?channel=google_maps")
      .then((response) => response.json())
      .then((settings: IntegrationSettings) => setGoogleMapsStatus(settings.status))
      .catch(() => setGoogleMapsStatus("pending"));
    fetch("/api/settings/integration?channel=email")
      .then((response) => response.json())
      .then((settings: IntegrationSettings) => setEmailStatus(settings.status))
      .catch(() => setEmailStatus("pending"));
  }, []);
  const activeConversation =
    channelFilteredConversations.find((conversation) => conversation.id === activeConversationId) ??
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
  const canDeleteConversations = initialUser.role === "مالك الحساب" || initialUser.role === "مسؤول الحساب";

  async function fetchData<T>(path: string) {
    const response = await fetch(path);
    if (!response.ok) return null;

    const payload = (await response.json()) as { ok: boolean; data?: T };
    return payload.ok && payload.data !== undefined ? payload.data : null;
  }

  async function loadDashboardData() {
    const requestId = ++loadDashboardDataSeqRef.current;
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

      if (requestId !== loadDashboardDataSeqRef.current) return;

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
          nextTemplates.some((template) => template.name === currentTemplate && isApprovedTemplate(template))
            ? currentTemplate
            : nextTemplates.find(isApprovedTemplate)?.name || nextTemplates[0].name
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
    if (googleMapsStatus !== "connected") return;

    let syncing = false;
    let cancelled = false;

    async function syncGoogleReviews() {
      if (syncing || cancelled) return;
      syncing = true;
      try {
        const response = await fetch("/api/google/reviews/sync", { method: "POST" });
        if (response.ok && !cancelled) await loadDashboardData();
      } finally {
        syncing = false;
      }
    }

    void syncGoogleReviews();
    const intervalId = window.setInterval(syncGoogleReviews, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [googleMapsStatus]);

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
    if (xStatus !== "connected") return;

    let syncing = false;
    const syncXMessages = async () => {
      if (syncing || document.visibilityState !== "visible") return;
      syncing = true;
      try {
        const response = await fetch("/api/x/sync", { method: "POST" });
        if (response.ok) {
          await loadDashboardData();
        }
      } finally {
        syncing = false;
      }
    };

    void syncXMessages();
    const intervalId = window.setInterval(syncXMessages, 30000);

    return () => window.clearInterval(intervalId);
  }, [xStatus]);

  useEffect(() => {
    const syncEmailInbox = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/email/sync", { method: "POST" })
        .then((response) => (response.ok ? response.json() : null))
        .then((result: { synced?: number } | null) => {
          if (result?.synced) void loadDashboardData();
        })
        .catch(() => {});
    };

    syncEmailInbox();
    const intervalId = window.setInterval(syncEmailInbox, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    writeCachedList(CONVERSATIONS_CACHE_KEY, conversations);
  }, [conversations]);

  useEffect(() => {
    writeCachedList(CUSTOMERS_CACHE_KEY, customers);
  }, [customers]);

  useEffect(() => {
    if (restoredNavigationRef.current || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view") || window.localStorage.getItem(DASHBOARD_VIEW_KEY);
    const requestedChannel = params.get("channel") || window.localStorage.getItem(DASHBOARD_CHANNEL_KEY);

    if (isViewKey(requestedView) && allowedViews.includes(requestedView)) {
      setActiveView(requestedView);
    }

    if (isConversationChannel(requestedChannel)) {
      setSelectedChannel(requestedChannel);
    }

    restoredNavigationRef.current = true;
  }, [allowedViews]);

  useEffect(() => {
    if (!restoredNavigationRef.current || typeof window === "undefined") return;

    window.localStorage.setItem(DASHBOARD_VIEW_KEY, activeView);
    window.localStorage.setItem(DASHBOARD_CHANNEL_KEY, selectedChannel);

    const url = new URL(window.location.href);
    url.searchParams.set("view", activeView);

    if (activeView === "inbox" && selectedChannel !== "all") {
      url.searchParams.set("channel", selectedChannel);
    } else {
      url.searchParams.delete("channel");
    }

    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activeView, selectedChannel]);

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
    if (activeConversationId && !channelFilteredConversations.some((conversation) => conversation.id === activeConversationId)) {
      setActiveConversationId("");
    }
  }, [activeConversationId, channelFilteredConversations]);

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
    if (!approvedTemplates.length) return;
    if (!approvedTemplates.some((template) => template.name === selectedTemplate)) {
      setSelectedTemplate(approvedTemplates[0].name);
    }
  }, [approvedTemplates, selectedTemplate]);

  const counts = useMemo<Record<ConversationFilter, number>>(() => {
    return {
      all: channelFilteredConversations.length,
      assigned: channelFilteredConversations.filter((conversation) => conversation.status === "assigned").length,
      unassigned: channelFilteredConversations.filter((conversation) => conversation.status === "unassigned").length,
      closed: channelFilteredConversations.filter((conversation) => conversation.status === "closed").length
    };
  }, [channelFilteredConversations]);

  const visibleConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    return channelFilteredConversations.filter((conversation) => {
      const matchesFilter = filter === "all" || conversation.status === filter;
      const matchesSearch = query
        ? [conversation.customer, conversation.phone, conversation.lastMessage, conversation.assignee, ...conversation.tags]
            .join(" ")
            .toLowerCase()
            .includes(query)
        : true;

      return matchesFilter && matchesSearch;
    });
  }, [channelFilteredConversations, conversationSearch, filter]);

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

    if (view === "inbox") {
      setSelectedChannel("all");
    }
    setActiveView(view);
    setMenuOpen(false);
  }

  function handleChannelChange(channel: ConversationChannel) {
    if (!allowedViews.includes("inbox")) return;

    setSelectedChannel(channel);
    setActiveView("inbox");
    setMenuOpen(false);
  }

  async function handleOpenConversation(conversationId: string) {
    if (!allowedViews.includes("inbox")) return;
    let conversation = scopedConversations.find((item) => item.id === conversationId);

    if (!conversation) {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: conversationId })
      });

      if (!response.ok) {
        window.alert(await readApiError(response));
        return;
      }

      const payload = (await response.json()) as { ok: boolean; data?: Conversation; error?: string };
      if (!payload.ok || !payload.data) {
        window.alert(payload.error || "تعذر فتح محادثة العميل");
        return;
      }

      conversation = payload.data;
      setConversations((current) => {
        const exists = current.some((item) => item.id === payload.data?.id);
        const nextConversations = exists
          ? current.map((item) => (item.id === payload.data?.id ? payload.data as Conversation : item))
          : [payload.data as Conversation, ...current];

        writeCachedList(CONVERSATIONS_CACHE_KEY, nextConversations);
        return nextConversations;
      });
    }

    if (!canViewAllConversations && !conversation) return;

    setActiveConversationId(conversation.id);
    if (activeView !== "inbox") {
      setSelectedChannel("all");
    }
    setActiveView("inbox");
    setChatPanel("chat");
    setMobileChatOpen(true);

    if (conversation?.unread) {
      updateConversation({ ...conversation, unread: undefined });
      void fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unread: 0 })
      });
    }
  }

  async function handleAssigneeChange(assignee: string) {
    if (!activeConversation.id) return;

    await handleAssignConversation(activeConversation.id, assignee);
  }

  async function handleAssignConversation(conversationId: string, assignee: string) {
    if (!canViewAllConversations) return;
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const status = assignee === "بدون موظف" ? "unassigned" : "assigned";
    updateConversation({
      ...conversation,
      assignee,
      status
    });

    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee, status })
    });
    if (!response.ok) {
      window.alert(await readApiError(response));
    }
    await loadDashboardData();
  }

  async function handleConversationTagsChange(nextTags: string[]) {
    if (!activeConversation.id) return;

    updateConversation({
      ...activeConversation,
      tags: nextTags
    });

    const response = await fetch(`/api/conversations/${activeConversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: nextTags })
    });

    if (!response.ok) {
      window.alert(await readApiError(response));
    }

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

  async function handleDeleteConversationById(conversationId: string) {
    if (!conversationId || !canDeleteConversations) return;
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    if (!window.confirm(`حذف محادثة ${conversation.customer}؟ سيتم حذف الرسائل من صندوق المحادثات فقط.`)) return;

    const deletedConversationId = conversation.id;
    const response = await fetch(`/api/conversations/${deletedConversationId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      window.alert(await readApiError(response));
      return;
    }

    setConversations((current) => {
      const nextConversations = current.filter((conversation) => conversation.id !== deletedConversationId);
      writeCachedList(CONVERSATIONS_CACHE_KEY, nextConversations);
      return nextConversations;
    });
    setActiveConversationId("");
    setChatPanel("chat");
    setMobileChatOpen(false);
    await loadDashboardData();
  }

  async function handleMarkConversationUnread(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    updateConversation({
      ...conversation,
      unread: Math.max(1, conversation.unread || 0)
    });

    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unread: Math.max(1, conversation.unread || 0) })
    });

    if (!response.ok) {
      window.alert(await readApiError(response));
    }

    await loadDashboardData();
  }

  async function handleSend(event: FormEvent<HTMLFormElement>, replyToMessageId?: string) {
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
        replyToMessageId,
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
      approvedTemplates.find((item) => item.name === selectedTemplate) ?? approvedTemplates[0];
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

  async function handleSendAttachment(attachment: MessageAttachment) {
    if (!activeConversation.id) return;
    if (activeConversation.windowExpired || activeConversation.status === "closed") return;

    const response = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "out",
        text: "",
        attachment: {
          type: attachment.type,
          name: attachment.name,
          dataUrl: attachment.url,
          mimeType: attachment.mimeType
        },
        conversation: activeConversationSnapshot
      })
    });

    if (!response.ok) {
      window.alert(await readApiError(response));
      return;
    }

    await loadDashboardData();
  }

  async function handleSendCommentReply(messageId: string, text: string) {
    if (!activeConversation.id) return;
    if (activeConversation.status === "closed") return;

    const response = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: "out",
        text,
        replyToCommentId: messageId,
        conversation: activeConversationSnapshot
      })
    });

    if (!response.ok) {
      window.alert(await readApiError(response));
      return;
    }

    await loadDashboardData();
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
        integrationStatus={integrationStatus}
        instagramStatus={instagramStatus}
        facebookStatus={facebookStatus}
        telegramStatus={telegramStatus}
        xStatus={xStatus}
        googleMapsStatus={googleMapsStatus}
        emailStatus={emailStatus}
        user={initialUser}
        profileStatus={currentProfileStatus}
        selectedChannel={selectedChannel}
        onChangeView={handleViewChange}
        onChangeChannel={handleChannelChange}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <main className="dashboard-main">
        <MobileTopbar title={viewTitles[activeView]} onToggleMenu={() => setMenuOpen((value) => !value)} />

        {activeView === "inbox" ? (
          <InboxView
            activeConversation={activeConversation}
            assigneeOptions={[...employees.map((employee) => employee.name), "بدون موظف"]}
            canChangeAssignee={canViewAllConversations}
            canDeleteConversation={canDeleteConversations}
            canDeleteAnyMessage={canViewAllConversations}
            canReopenConversation={canReopenConversations}
            chatPanel={chatPanel}
            composerMode={composerMode}
            conversations={channelFilteredConversations}
            counts={counts}
            filter={filter}
            assignedOnly={!canViewAllConversations}
            message={message}
            quickReplies={quickReplies}
            search={conversationSearch}
            mobileChatOpen={mobileChatOpen}
            selectedTemplate={selectedTemplate}
            templates={templates}
            currentUserName={initialUser.name}
            tags={tags}
            visibleConversations={visibleConversations}
            onChangeAssignee={handleAssigneeChange}
            onChangeChatPanel={setChatPanel}
            onChangeComposerMode={setComposerMode}
            onChangeFilter={setFilter}
            onChangeMessage={setMessage}
            onChangeSearch={setConversationSearch}
            onChangeSelectedConversation={handleOpenConversation}
            onChangeSelectedTemplate={setSelectedTemplate}
            onChangeTags={handleConversationTagsChange}
            onAssignConversation={handleAssignConversation}
            onCloseConversation={handleConversationStatusToggle}
            onDeleteConversationById={handleDeleteConversationById}
            onDeleteMessage={handleDeleteMessage}
            onMarkConversationUnread={handleMarkConversationUnread}
            onSend={handleSend}
            onSendAttachment={handleSendAttachment}
            onSendCommentReply={handleSendCommentReply}
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
            integrationStatus={integrationStatus}
            onIntegrationChange={handleIntegrationChange}
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
