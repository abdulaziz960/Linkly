import { riyadhStamp, type ConversationExport } from "./conversation-export";

/** One workbook, two sheets: a row per conversation and a row per message, both right-to-left. */
export async function buildConversationsWorkbook(data: ConversationExport, withAttachments: boolean): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Linkly";

  const summary = book.addWorksheet("المحادثات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  summary.columns = [
    { header: "العميل", key: "customer", width: 24 },
    { header: "الجوال", key: "phone", width: 18 },
    { header: "القناة", key: "channel", width: 16 },
    { header: "الحالة", key: "status", width: 12 },
    { header: "المسؤول", key: "assignee", width: 20 },
    { header: "الوسوم", key: "tags", width: 24 },
    { header: "أول رسالة", key: "first", width: 18 },
    { header: "آخر رسالة", key: "last", width: 18 },
    { header: "عدد الرسائل", key: "count", width: 12 }
  ];
  const detail = book.addWorksheet("الرسائل", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  detail.columns = [
    { header: "العميل", key: "customer", width: 24 },
    { header: "القناة", key: "channel", width: 16 },
    { header: "الوقت", key: "at", width: 18 },
    { header: "المرسل", key: "sender", width: 22 },
    { header: "النوع", key: "kind", width: 12 },
    { header: "الرسالة", key: "text", width: 70 },
    ...(withAttachments ? [{ header: "المرفق", key: "attachment", width: 28 }] : [])
  ];

  const kindLabel = { customer: "من العميل", agent: "من الفريق", note: "ملاحظة داخلية" } as const;
  for (const conversation of data.conversations) {
    summary.addRow({
      customer: conversation.customerName,
      phone: conversation.phone,
      channel: conversation.channel,
      status: conversation.status,
      assignee: conversation.assignee || "غير مسندة",
      tags: conversation.tags.join("، "),
      first: riyadhStamp(conversation.firstAt),
      last: riyadhStamp(conversation.lastAt),
      count: conversation.messages.length
    });
    for (const message of conversation.messages) {
      detail.addRow({
        customer: conversation.customerName,
        channel: conversation.channel,
        at: riyadhStamp(message.at),
        sender: message.sender,
        kind: kindLabel[message.kind],
        text: message.text,
        attachment: message.attachment
      });
    }
  }
  for (const sheet of [summary, detail]) {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    header.alignment = { vertical: "middle", horizontal: "center" };
  }
  detail.getColumn("text").alignment = { wrapText: true, vertical: "top" };
  return Buffer.from(await book.xlsx.writeBuffer());
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A self-contained print page: the browser's "save as PDF" gives a properly shaped Arabic PDF, one conversation per block. */
export function buildConversationsPrintHtml(data: ConversationExport, options: { companyName: string; withAttachments: boolean; withNotes: boolean }): string {
  const blocks = data.conversations.map((conversation) => {
    const messages = conversation.messages.map((message) => {
      const attachment = message.attachment
        ? `<div class="att">${message.attachmentUrl ? `<a href="${escapeHtml(message.attachmentUrl)}">📎 ${escapeHtml(message.attachment)}</a>` : `📎 ${escapeHtml(message.attachment)}`}</div>`
        : "";
      return `<div class="msg ${message.kind}"><div class="meta"><b>${escapeHtml(message.sender)}</b><span dir="ltr">${escapeHtml(riyadhStamp(message.at))}</span></div><div class="text">${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>${attachment}</div>`;
    }).join("");
    const tags = conversation.tags.length ? `<span class="chip">${conversation.tags.map(escapeHtml).join(" · ")}</span>` : "";
    return `<section class="conv"><header><h2>${escapeHtml(conversation.customerName)}</h2><div class="info"><span>${escapeHtml(conversation.phone)}</span><span>${escapeHtml(conversation.channel)}</span><span>${escapeHtml(conversation.status)}</span><span>${conversation.assignee ? `المسؤول: ${escapeHtml(conversation.assignee)}` : "غير مسندة"}</span>${tags}</div></header>${messages}</section>`;
  }).join("");

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>تصدير المحادثات ${escapeHtml(data.from)} إلى ${escapeHtml(data.to)}</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;font-family:"IBM Plex Sans Arabic","Noto Sans Arabic",Tahoma,Arial,sans-serif;color:#17332f;background:#fff;line-height:1.7;font-size:13px}
.bar{position:sticky;top:0;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 24px;background:#0f766e;color:#fff}.bar button{border:0;border-radius:10px;padding:8px 16px;font:inherit;font-weight:700;background:#fff;color:#0f766e;cursor:pointer}
.doc{max-width:820px;margin:0 auto;padding:24px}.title h1{margin:0 0 4px;font-size:22px}.title p{margin:0 0 16px;color:#5a706c}.note{padding:10px 14px;border-radius:10px;background:#fff7e6;color:#8a5a00;margin-bottom:16px}
.conv{border:1px solid #d7e3e0;border-radius:14px;padding:14px 16px;margin:0 0 16px;break-inside:auto}.conv header{border-bottom:1px solid #e5eeec;margin-bottom:10px;padding-bottom:8px;break-after:avoid}.conv h2{margin:0;font-size:16px}
.info{display:flex;flex-wrap:wrap;gap:6px 14px;color:#5a706c;font-size:12px;margin-top:2px}.chip{background:#e6f4f1;color:#0f766e;border-radius:99px;padding:0 8px}
.msg{max-width:78%;margin:8px 0;padding:8px 12px;border-radius:12px;break-inside:avoid;background:#f1f6f5}.msg.agent{margin-inline-start:auto;background:#d9f2ee}.msg.note{max-width:100%;background:#fff3d6;border:1px dashed #e0b35a}
.meta{display:flex;justify-content:space-between;gap:16px;font-size:11px;color:#5a706c}.meta b{color:#17332f}.text{white-space:pre-wrap;word-break:break-word}.att{margin-top:4px;font-size:12px}.att a{color:#0f766e}
@media print{.bar{display:none}.doc{max-width:none;padding:0}@page{size:A4;margin:14mm}.conv{border-color:#bbb}.msg{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="bar"><span>جاهز للحفظ كملف PDF: اضغط «طباعة» ثم اختر «حفظ بصيغة PDF»</span><button onclick="window.print()">طباعة / حفظ PDF</button></div><main class="doc"><div class="title"><h1>${escapeHtml(options.companyName)} — تصدير المحادثات</h1><p>الفترة من ${escapeHtml(data.from)} إلى ${escapeHtml(data.to)} · ${data.conversations.length} محادثة · ${data.totalMessages} رسالة${options.withNotes ? " · تتضمن ملاحظات داخلية" : ""}</p></div>${data.truncated ? `<div class="note">الفترة تحتوي على محادثات أكثر مما يتسع التصدير، فعُرض جزء منها. قصّر الفترة للحصول على الباقي.</div>` : ""}${blocks || `<p>لا توجد محادثات في هذه الفترة.</p>`}</main></body></html>`;
}
