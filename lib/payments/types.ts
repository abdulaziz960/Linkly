// The payment methods a merchant can take on the platform's own catalog. Moyasar (cards, the original) lives in
// lib/catalog-payments.ts; the buy-now-pay-later methods (Tabby, Tamara) are modules here. A method creates a payment
// for an order (returning the link the customer pays at) and later says whether it was paid; the order's `paymentId`
// is prefixed with the method ("tabby-", "tamara-") so a callback finds the right one.

export type ProviderKey = "moyasar" | "tabby" | "tamara";
export const PROVIDER_KEYS: ProviderKey[] = ["moyasar", "tabby", "tamara"];

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  moyasar: "البطاقة (ميسر)",
  tabby: "تابي",
  tamara: "تمارا"
};

/** A short name for a button (WhatsApp limits a button title to 20 characters). */
export const PROVIDER_BUTTON_LABELS: Record<ProviderKey, string> = {
  moyasar: "ادفع بالبطاقة",
  tabby: "ادفع بتابي",
  tamara: "ادفع بتمارا"
};

export type PaymentCustomer = {
  name: string;
  /** Digits with the country code, no plus: "966500000001". */
  phone: string;
  email?: string;
  /** When the customer first wrote to the merchant (ISO). */
  registeredSince: string;
  /** Their paid orders with this merchant so far (risk scoring by the installment providers). */
  history: { count: number; firstPaidAt: string; lastPaidAt: string };
};

export type PaymentItem = { name: string; sku: string; quantity: number; unitPrice: number };

export type PaymentRequest = {
  tenantId: string;
  orderId: string;
  /** The total the customer pays, in SAR, delivery included and any discount taken off. */
  amount: number;
  currency: string;
  description: string;
  items: PaymentItem[];
  customer: PaymentCustomer;
  discountAmount: number;
  discountName: string;
  shippingFee: number;
  shipping?: { city: string; address: string };
  /** Where the customer lands after paying, cancelling or failing. */
  urls: { success: string; cancel: string; failure: string };
};

export type CreatedPayment = { externalId: string; url: string };

/** A method refused or could not start this payment: `rejected` means this customer / amount is not eligible (offer another method). */
export class PaymentProviderError extends Error {
  kind: "rejected" | "failed";
  constructor(message: string, kind: "rejected" | "failed" = "failed") {
    super(message);
    this.name = "PaymentProviderError";
    this.kind = kind;
  }
}

export type PaymentVerdict = { state: "paid" | "failed" | "pending"; reason?: string };
