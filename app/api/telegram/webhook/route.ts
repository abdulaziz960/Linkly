import { NextRequest, NextResponse } from "next/server";
import { getIntegrationSettings } from "../../../../lib/database";
import { storeTelegramMessage } from "../../../../lib/telegram-inbox";
import { runTelegramBot } from "../../../../lib/bot-engine";

export const runtime = "nodejs";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    caption?: string;
    chat?: {
      id?: number | string;
      type?: string;
      first_name?: string;
      last_name?: string;
      username?: string;
      title?: string;
    };
    from?: {
      first_name?: string;
      last_name?: string;
      username?: string;
      is_bot?: boolean;
    };
    photo?: unknown;
    document?: { file_name?: string };
    voice?: unknown;
    audio?: unknown;
    sticker?: unknown;
    reply_to_message?: {
      message_id?: number;
      text?: string;
      caption?: string;
    };
  };
};

function getTelegramName(message: NonNullable<TelegramUpdate["message"]>) {
  const chat = message.chat;
  const from = message.from;
  const fullName = [from?.first_name, from?.last_name].filter(Boolean).join(" ").trim();

  return chat?.title || fullName || from?.username || chat?.username || "";
}

function getTelegramText(message: NonNullable<TelegramUpdate["message"]>) {
  if (message.text?.trim()) return message.text.trim();
  if (message.caption?.trim()) return message.caption.trim();
  if (message.photo) return "صورة واردة من Telegram";
  if (message.voice || message.audio) return "رسالة صوتية واردة من Telegram";
  if (message.sticker) return "ملصق وارد من Telegram";
  if (message.document) return message.document.file_name ? `مستند وارد: ${message.document.file_name}` : "مستند وارد من Telegram";
  return "رسالة واردة من Telegram";
}

export async function POST(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenant")?.trim() || "tenant-demo";
  const settings = await getIntegrationSettings("telegram", tenantId);
  const secret = settings.verifyToken?.trim();

  if (secret) {
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token") || "";
    if (receivedSecret !== secret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  const chatId = message?.chat?.id;

  if (!message || !chatId || message.from?.is_bot) {
    return NextResponse.json({ ok: true });
  }

  const stored = await storeTelegramMessage({
    tenantId,
    chatId: String(chatId),
    name: getTelegramName(message),
    text: getTelegramText(message),
    direction: "in",
    messageId: message.message_id ? `${chatId}-${message.message_id}` : update?.update_id ? `${chatId}-${update.update_id}` : undefined,
    receivedAt: message.date ? new Date(message.date * 1000) : new Date(),
    replyToMessageId: message.reply_to_message?.message_id ? String(message.reply_to_message.message_id) : undefined
  });

  void runTelegramBot({
    tenantId,
    conversationId: stored.conversationId,
    chatId: String(chatId)
  });

  return NextResponse.json({ ok: true });
}
