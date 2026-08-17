export type ViewKey =
  | "inbox"
  | "contacts"
  | "tags"
  | "bot"
  | "automations"
  | "campaigns"
  | "templates"
  | "quickReplies"
  | "workHours"
  | "reports"
  | "leads"
  | "teams"
  | "employees"
  | "settings";

export type ConversationStatus = "assigned" | "unassigned" | "closed";
export type ConversationFilter = "all" | ConversationStatus | "mine" | "unread";
export type ConversationChannel = "whatsapp" | "instagram" | "x" | "facebook" | "google_maps" | "website" | "telegram" | "email" | "tiktok" | "sms";
export type ConversationChannelFilter = "all" | ConversationChannel;
export type ChatPanel = "chat" | "profile";
export type ComposerMode = "reply" | "note";

export type MessageAttachment = {
  type: "image" | "audio" | "sticker" | "document";
  url: string;
  name: string;
  mimeType?: string;
};

export type Message = {
  id: string;
  direction: "in" | "out" | "note";
  text: string;
  time: string;
  createdAt?: string;
  author?: string;
  attachment?: MessageAttachment;
  source?: {
    type: string;
    id?: string;
    url?: string;
    label?: string;
  };
  replyTo?: {
    messageId?: string;
    text?: string;
    author?: string;
  };
};

export type Conversation = {
  id: string;
  channel: ConversationChannel;
  customer: string;
  phone: string;
  initial: string;
  lastMessage: string;
  status: ConversationStatus;
  assignee: string;
  unread?: number;
  windowExpired?: boolean;
  lastActivityAt?: string;
  firstMessageTime?: string;
  lastMessageTime?: string;
  firstMessageAt?: string;
  lastMessageAt?: string;
  tags: string[];
  messages: Message[];
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  initial: string;
  channels: ConversationChannel[];
  tags: string[];
};

export type MessageTemplate = {
  name: string;
  message: string;
  type?: "خدمة" | "تسويق";
  category?: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language?: string;
  status?: "معتمد" | "قيد المراجعة" | "مرفوض";
  headerType?: "NONE" | "TEXT" | "IMAGE" | "VIDEO";
  headerText?: string;
  headerMedia?: string;
  footer?: string;
  buttonType?: "NONE" | "QUICK_REPLY" | "URL" | "PHONE";
  buttonText?: string;
  buttonPhone?: string;
  buttonUrl?: string;
  metaId?: string;
  syncedAt?: string;
  lastUsed?: string;
};

export type NavItem = {
  key: ViewKey;
  label: string;
};

export type Employee = {
  id: string;
  name: string;
  role: "مالك الحساب" | "مشرف" | "موظف دعم";
  status: "متصل" | "مشغول" | "غير متصل";
  permissions: string;
  email: string;
  initial: string;
};

export type Team = {
  id: string;
  name: string;
  lead: string;
  memberIds: string[];
  routing: "تلقائي بالتساوي" | "يدوي";
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  description: string;
};

export type QuickReply = {
  id: string;
  shortcut: string;
  text: string;
  team: string;
  usage: number;
};

export type AutomationRule = {
  id: string;
  name: string;
  description: string;
  trigger?: string;
  action?: string;
  target?: string;
  delayMinutes?: number;
  conditions?: Array<{
    field: string;
    operator: string;
    value: string;
  }>;
  actions?: Array<{
    type: string;
    target: string;
  }>;
  createdAt: string;
  enabled: boolean;
};

export type Campaign = {
  id: string;
  name: string;
  sent: number;
  total: number;
  progress: string;
  status: "الحملة أنجزت" | "قيد الإرسال" | "مجدولة" | "ملغاة";
  updatedAt: string;
};

export type Lead = {
  id: string;
  customer: string;
  phone?: string;
  interest: string;
  budget: string;
  source?: string;
  notes?: string;
  stage: string;
  employee: string;
  lastContact: string;
  tenantId?: string;
};

export type WorkSchedule = {
  id: string;
  team: string;
  days: string;
  start: string;
  end: string;
  status: "نشط" | "متوقف";
  holidays: "مفعلة" | "غير مفعلة";
};

export type DashboardUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
};

export type IntegrationSettings = {
  id: string;
  provider: "whatsapp_cloud" | "instagram" | "facebook" | "telegram" | "x" | "google_maps" | "email" | "website" | "tiktok" | "unifonic" | "gmail" | "outlook" | "external";
  status: "connected" | "not_connected" | "pending";
  businessName: string;
  wabaName: string;
  phoneNumber: string;
  phoneNumberId: string;
  wabaId: string;
  appId: string;
  configId: string;
  verifyToken: string;
  accessToken: string;
  xConsumerKey: string;
  xConsumerSecret: string;
  xBearerToken: string;
  xAccessToken: string;
  xAccessTokenSecret: string;
  googleAccountId: string;
  googleLocationId: string;
  googleRefreshToken: string;
  webhookUrl: string;
  updatedAt: string;
};
