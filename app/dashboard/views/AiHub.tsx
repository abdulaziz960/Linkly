"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";
import AiSettingsView from "./AiSettingsView";
import KnowledgeBaseView from "./KnowledgeBaseView";

type Tab = "knowledge" | "assistant";

type AiHubProps = {
  initialTab: Tab;
  canViewAssistant: boolean;
  canViewKnowledge: boolean;
};

/**
 * One page for the AI assistant and the knowledge base it answers from. The assistant only replies from the
 * knowledge base, so they were two sidebar entries for one subject. A tab only shows for a plan / role that
 * has that part; with a single one there is no tab bar.
 */
export default function AiHub({ initialTab, canViewAssistant, canViewKnowledge }: AiHubProps) {
  const { t } = useLanguage();
  const both = canViewAssistant && canViewKnowledge;
  const [tab, setTab] = useState<Tab>(() => (both ? initialTab : canViewKnowledge && !canViewAssistant ? "knowledge" : "assistant"));

  useEffect(() => {
    setTab(both ? initialTab : canViewKnowledge && !canViewAssistant ? "knowledge" : "assistant");
  }, [initialTab, both, canViewAssistant, canViewKnowledge]);

  function choose(next: Tab) {
    setTab(next);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set("view", next === "knowledge" ? "knowledgeBase" : "ai");
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    } catch {
      // the address is a convenience only
    }
  }

  return (
    <>
      {both ? (
        <div className="pipeline-tabs reports-hub-tabs" role="tablist" aria-label={t("مساعد AI وقاعدة المعرفة", "AI assistant and knowledge base")}>
          <button type="button" role="tab" aria-selected={tab === "knowledge"} onClick={() => choose("knowledge")}>{t("قاعدة المعرفة", "Knowledge base")}</button>
          <button type="button" role="tab" aria-selected={tab === "assistant"} onClick={() => choose("assistant")}>{t("إعدادات المساعد", "Assistant settings")}</button>
        </div>
      ) : null}
      {both ? (
        <p className="muted-copy" style={{ margin: "10px 24px 0" }}>
          {t("المساعد وخطوة «رد AI تلقائي» لا يجيبان إلا من قاعدة المعرفة، فأضف فيها أسئلتك وأجوبتك أولًا.", "The assistant and the automatic AI reply step only answer from the knowledge base, so add your questions and answers there first.")}
        </p>
      ) : null}
      {tab === "knowledge" && canViewKnowledge ? <KnowledgeBaseView /> : <AiSettingsView />}
    </>
  );
}
