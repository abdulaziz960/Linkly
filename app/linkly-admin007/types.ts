export type SubscriptionRow = {
  id: string;
  tenantId: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  plan: string;
  status: string;
  employeeLimit: number;
  amount: number;
  billingCycle: string;
  renewalAt: string;
  createdAt: string;
  updatedAt: string;
  employeeCount: number;
  conversationCount: number;
  campaignBalance: number;
};

export type UsageRow = SubscriptionRow & {
  messagesLast30d: number;
  aiEventsLast30d: number;
  aiCostLast30dSar: number;
};

export type PaymentRow = {
  id: string;
  tenantId: string;
  companyName: string;
  amount: number;
  status: string;
  moyasarId: string;
  paymentUrl: string;
  createdAt: string;
  completedAt: string;
  source: string;
  messages: number;
  // Payment ledger details (lib/payment-status.ts, docs/payments.md).
  gateway?: string;
  gatewayPaymentId?: string;
  paymentMethod?: string;
  gatewayStatus?: string;
  failureReason?: string;
  failedAt?: string;
  initiatedBy?: string;
  planName?: string;
  periodStart?: string;
  periodEnd?: string;
};

export type PlanRow = {
  id: string;
  name: string;
  monthlyPrice: number;
  employeeLimit: number;
  aiDailyLimit: number;
  aiMonthlyLimit: number;
  // "*" (unrestricted) or a comma-separated list of channel keys - see lib/channel-catalog.ts.
  allowedChannels: string;
  // Marketing messages credited to CampaignBalance per subscription payment on this plan - see lib/message-quota.ts.
  messageQuota: number;
  sortOrder: number;
  active: number;
  createdAt: string;
  updatedAt: string;
};

export type DiscountCodeRow = {
  id: string;
  name: string;
  code: string;
  discountType: string;
  discountValue: number;
  maxDiscountAmount: number;
  minimumAmount: number;
  applicablePlanIds: string;
  newUsersOnly: number;
  firstSubscriptionOnly: number;
  usageLimit: number;
  usageLimitPerUser: number;
  usedCount: number;
  startsAt: string;
  expiresAt: string;
  active: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DiscountCodeUsageRow = {
  id: string;
  discountCodeId: string;
  tenantId: string;
  userId: string;
  userName: string;
  email: string;
  planId: string;
  planName: string;
  paymentId: string;
  subscriptionId: string;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  paymentStatus: string;
  usedAt: string;
  createdAt: string;
};

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  lastLoginAt?: string;
  disabled?: number;
  // Permission keys held by the member (see lib/admin-permissions.ts); full access when omitted.
  permissions?: string[];
};

export type AdminUser = { id: string; name: string; email: string };
