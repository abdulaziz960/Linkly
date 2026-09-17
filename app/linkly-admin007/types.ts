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
  sortOrder: number;
  active: number;
  createdAt: string;
  updatedAt: string;
};

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type AdminUser = { id: string; name: string; email: string };
