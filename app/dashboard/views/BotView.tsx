"use client";

import { FormEvent, useState } from "react";

type BotNode = {
  id: number;
  type: string;
  title: string;
  content: string;
};

const nodeTypes = ["إرسال رسالة", "إرسال قائمة قصيرة", "إرسال قائمة طويلة", "تحويل لفريق", "إغلاق المحادثة"];

export default function BotView() {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [nodes, setNodes] = useState<BotNode[]>([
    { id: 1, type: "إرسال رسالة", title: "رسالة ترحيب", content: "أهلاً بك، كيف نقدر نخدمك؟" },
    { id: 2, type: "إرسال قائمة طويلة", title: "قائمة اختيارات", content: "مبيعات، دعم، شحن، موظف" }
  ]);
  const [nodeType, setNodeType] = useState(nodeTypes[0]);
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeContent, setNodeContent] = useState("");

  function addNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextId = nodes.length ? Math.max(...nodes.map((node) => node.id)) + 1 : 1;

    setNodes((current) => [
      ...current,
      {
        id: nextId,
        type: nodeType,
        title: nodeTitle.trim() || nodeType,
        content: nodeContent.trim() || "لم يتم تحديد المحتوى بعد"
      }
    ]);
    setNodeTitle("");
    setNodeContent("");
  }

  return (
    <section className="page-stack">
      <div className="page-hero">
        <div>
          <h1>الرد الآلي</h1>
          <p>أنشئ روبوت محادثة يساعد العميل من أول رسالة، يعرض له الخيارات المناسبة، يرسل ردوداً جاهزة، ويحوّل المحادثة للموظف أو الفريق الصحيح عند الحاجة.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => setBuilderOpen(true)}>＋ إنشاء رد آلي</button>
      </div>
      <div className="bot-canvas">
        <div className="bot-toolbar"><b>مخطط الرد الآلي</b><span>ابدأ من أول رسالة ثم اربط الخطوات حسب اختيار العميل</span></div>
        <div className="bot-node start"><b>البداية</b><small>عند وصول رسالة جديدة</small></div>
        <div className="bot-node reply"><b>{nodes[0]?.title || "رسالة ترحيب"}</b><small>{nodes[0]?.content || "أهلاً بك، كيف نقدر نخدمك؟"}</small></div>
        <div className="bot-node menu-node"><b>{nodes[1]?.title || "قائمة اختيارات"}</b><small>{nodes[1]?.content || "مبيعات، دعم، شحن، موظف"}</small></div>
        <div className="bot-node action"><b>تحويل لفريق</b><small>إسناد المحادثة حسب الاختيار</small></div>
        <div className="bot-menu-preview">
          <b>إضافة عقدة</b>
          <span>إرسال رسالة</span>
          <span>إرسال قائمة</span>
          <span>تحويل لموظف</span>
          <span>إغلاق المحادثة</span>
        </div>
      </div>

      {builderOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setBuilderOpen(false)}>
          <div className="account-modal form-modal bot-builder-modal" role="dialog" aria-modal="true" aria-label="إنشاء رد آلي" onClick={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <button className="icon-btn" type="button" aria-label="إغلاق" onClick={() => setBuilderOpen(false)}>×</button>
              <h2>إنشاء رد آلي</h2>
            </header>
            <div className="account-modal-body">
              <form className="form-grid" onSubmit={addNode}>
                <div className="split-fields">
                  <label>
                    <span>نوع العقدة</span>
                    <select value={nodeType} onChange={(event) => setNodeType(event.target.value)}>
                      {nodeTypes.map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>اسم العقدة</span>
                    <input value={nodeTitle} onChange={(event) => setNodeTitle(event.target.value)} placeholder="مثال: قائمة الحسابات" />
                  </label>
                </div>
                <label>
                  <span>المحتوى أو الخيارات</span>
                  <textarea value={nodeContent} onChange={(event) => setNodeContent(event.target.value)} placeholder="اكتب الرسالة أو الخيارات التي ستظهر للعميل" rows={4} />
                </label>
                <button className="btn primary" type="submit">＋ إضافة عقدة</button>
              </form>

              <div className="bot-builder-list">
                {nodes.map((node) => (
                  <div className="bot-builder-node" key={node.id}>
                    <div>
                      <b>{node.title}</b>
                      <span>{node.type}</span>
                      <small>{node.content}</small>
                    </div>
                    <button className="btn danger" type="button" onClick={() => setNodes((current) => current.filter((item) => item.id !== node.id))}>حذف</button>
                  </div>
                ))}
              </div>
            </div>
            <footer className="modal-foot">
              <button className="btn soft" type="button" onClick={() => setBuilderOpen(false)}>إلغاء</button>
              <button className="btn primary" type="button" onClick={() => setBuilderOpen(false)}>حفظ الرد الآلي</button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
