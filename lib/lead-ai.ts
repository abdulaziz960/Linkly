import { prisma } from "./prisma";
import { sendWhatsAppTextMessage } from "./whatsapp-send";

type LeadAiInput = {
  tenantId?: string;
  conversationId: string;
  customerName: string;
  customerPhone: string;
  incomingText: string;
};

function aiEnabled() {
  return process.env.AI_LEAD_ASSISTANT_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY);
}

async function generateLeadReply(input: LeadAiInput) {
  const lead = await prisma.lead.findFirst({
    where: {
      tenantId: input.tenantId || "tenant-demo",
      phone: {
        contains: input.customerPhone.slice(-8)
      }
    },
    orderBy: {
      lastContact: "desc"
    }
  }).catch(() => null);

  const prompt = [
    "أنت موظف مبيعات عربي في منصة AudienceW. اكتب رد واتساب قصير وطبيعي جدًا، كأنك إنسان.",
    "لا تقل إنك ذكاء اصطناعي. لا تطوّل. اسأل سؤال متابعة واحد فقط.",
    `اسم العميل: ${input.customerName}`,
    `رقم العميل: ${input.customerPhone}`,
    `اهتمام العميل: ${lead?.interest || "غير محدد"}`,
    `ميزانية العميل: ${lead?.budget || "غير محددة"}`,
    `مصدر الليد: ${lead?.source || "Zapier"}`,
    `ملاحظات الليد: ${lead?.notes || "لا توجد"}`,
    `رسالة العميل: ${input.incomingText}`
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_LEAD_MODEL || "gpt-4.1-mini",
      input: prompt,
      max_output_tokens: 180
    })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Lead AI reply generation failed", payload?.error || payload);
    return "";
  }

  return String(payload?.output_text || "").trim();
}

export async function maybeSendLeadAiReply(input: LeadAiInput) {
  if (!aiEnabled()) return { ok: false, skipped: true };

  const recentAiMessage = await prisma.message.findFirst({
    where: {
      conversationId: input.conversationId,
      direction: "out",
      author: "AudienceW AI"
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (recentAiMessage?.createdAt && Date.now() - new Date(recentAiMessage.createdAt).getTime() < 1000 * 60 * 2) {
    return { ok: false, skipped: true };
  }

  const reply = await generateLeadReply(input);
  if (!reply) return { ok: false, skipped: true };

  return sendWhatsAppTextMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    to: input.customerPhone,
    text: reply,
    author: "AudienceW AI"
  });
}
