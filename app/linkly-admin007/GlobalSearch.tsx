"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AdminSearchResults } from "../api/admin/search/route";
import Icon from "./ds/Icon";

type Row = { key: string; group: string; title: string; subtitle: string; href: string };

export default function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [results, setResults] = useState<AdminSearchResults | null>(null);
  const [active, setActive] = useState(0);

  const rows: Row[] = useMemo(() => {
    if (!results) return [];
    return [
      ...results.clients.map((item) => ({ key: `c-${item.id}`, group: "العملاء", title: item.title, subtitle: item.subtitle, href: item.href })),
      ...results.payments.map((item) => ({ key: `p-${item.id}`, group: "المدفوعات", title: item.title, subtitle: item.subtitle, href: item.href }))
    ];
  }, [results]);

  // Ctrl/Cmd+K or "/" focuses the search from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((event.target as HTMLElement)?.tagName ?? "") || (event.target as HTMLElement)?.isContentEditable;
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json()) as { ok: boolean; data?: AdminSearchResults };
        if (!response.ok || !body.ok || !body.data) throw new Error("search failed");
        setResults(body.data);
        setFailed(false);
        setActive(0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const go = (row: Row) => {
    setOpen(false);
    setQuery("");
    router.push(row.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(rows.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && rows[active]) {
      event.preventDefault();
      go(rows[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const term = query.trim();
  let lastGroup = "";

  return (
    <div className="ds-popover-wrap ds-global-search" ref={wrapRef}>
      <div className="ds-search">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          className="ds-input"
          type="search"
          role="combobox"
          aria-expanded={open && term.length >= 2}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows[active] ? `${listId}-${rows[active].key}` : undefined}
          placeholder="ابحث في العملاء والمدفوعات…"
          aria-label="بحث شامل في العملاء والمدفوعات"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && term.length >= 2 ? (
        <div className="ds-popover" id={listId} role="listbox" style={{ width: "min(460px, calc(100vw - 24px))" }}>
          {loading && !results ? <p className="ds-state" style={{ padding: 18 }}>جارٍ البحث…</p> : null}
          {failed ? <p className="ds-state" style={{ padding: 18 }} role="alert">تعذر البحث الآن. حاول مرة أخرى.</p> : null}
          {!loading && !failed && results && rows.length === 0 ? (
            <div className="ds-state"><strong>لا نتائج لـ «{term}»</strong><p>جرّب اسم العميل أو بريده أو رقم عملية الدفع.</p></div>
          ) : null}
          {rows.map((row, index) => {
            const header = row.group !== lastGroup ? row.group : null;
            lastGroup = row.group;
            return (
              <div key={row.key}>
                {header ? <div className="ds-search-group">{header}</div> : null}
                <button type="button" role="option" id={`${listId}-${row.key}`} aria-selected={index === active} data-active={index === active || undefined} className="ds-popover-row" style={{ width: "100%", border: 0, textAlign: "start", background: "none", font: "inherit", cursor: "pointer" }} onMouseEnter={() => setActive(index)} onClick={() => go(row)}>
                  <div><strong>{row.title}</strong><span>{row.subtitle}</span></div>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
