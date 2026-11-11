"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, GripVertical, History, ListOrdered, Plus, Search, Trash2, Undo2 } from "lucide-react";
import {
  PENALTY_SEVERITIES,
  PENALTY_UNITS,
  sanitizeCatalogDoc,
  type CatalogItem,
  type PenaltyCatalogDoc,
  type PenaltySeverity,
  type PenaltyUnit,
} from "@/lib/payroll/penalties";

// Справочник штрафов контролёра : офис правит ЧЕРНОВИК, кнопка « Подтвердить » публикует новую версию -
// её сразу видят контролёр (/controle), Primes & Bonus и страница бригады. Уже внесённые штрафы не меняются
// (в журнале хранятся и текст, и сумма на момент проверки).

type Published = { version: number; doc: PenaltyCatalogDoc; publishedAt: string | null; publishedBy: string | null };
type HistoryRow = { version: number; note: string | null; published_by_email: string | null; published_at: string | null };
type AdminData = { published: Published; draft: { doc: PenaltyCatalogDoc; updatedAt: string; by: string | null } | null; history: HistoryRow[]; error?: string };

const SEV: Record<string, { pill: string; dot: string }> = {
  Критическая: { pill: "bg-error-50 text-error-700", dot: "bg-error-500" },
  Серьёзная: { pill: "bg-warning-50 text-warning-800", dot: "bg-warning-500" },
  Средняя: { pill: "bg-primary-50 text-primary-700", dot: "bg-primary-500" },
  Малая: { pill: "bg-stone-100 text-stone-600", dot: "bg-stone-400" },
};

const uid = () => "n:" + Math.random().toString(36).slice(2, 10);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "");
const itemSig = (i: CatalogItem) => JSON.stringify([i.code, i.stage, i.description, i.severity, i.amount, i.amountMax ?? null, i.unit, i.note ?? "", i.section]);
const eur = (n: number) => `${Math.round(n * 100) / 100} €`;

function priceText(it: CatalogItem): string {
  switch (it.unit) {
    case "manual":
      return "вручную";
    case "range":
      return `${it.amount}–${it.amountMax ?? it.amount} €`;
    case "per_piece":
      return `${eur(it.amount)} / шт`;
    case "per_day":
      return `${eur(it.amount)} / день`;
    default:
      return eur(it.amount);
  }
}

function diffDocs(base: PenaltyCatalogDoc, next: PenaltyCatalogDoc) {
  const baseById = new Map(base.items.map((i) => [i.id, i]));
  const nextById = new Map(next.items.map((i) => [i.id, i]));
  const added = next.items.filter((i) => !baseById.has(i.id)).map((i) => i.id);
  const removed = base.items.filter((i) => !nextById.has(i.id));
  const changed = next.items.filter((i) => baseById.has(i.id) && itemSig(i) !== itemSig(baseById.get(i.id)!)).map((i) => i.id);
  const sectionsChanged = JSON.stringify(base.sections) !== JSON.stringify(next.sections) || base.divisor !== next.divisor;
  // Порядок пунктов (перетаскивание, стрелки): сравниваем последовательности id тех пунктов, что есть и там и там.
  const common = (a: CatalogItem[], b: CatalogItem[]) => a.filter((i) => b.some((j) => j.id === i.id)).map((i) => i.id).join("|");
  const reordered = common(base.items, next.items) !== common(next.items, base.items);
  return { added, removed, changed, sectionsChanged, reordered, any: added.length + removed.length + changed.length > 0 || sectionsChanged || reordered };
}

/** Куда сейчас « целится » перетаскиваемый пункт (для линии-подсказки). */
type DropOver = { kind: "item"; id: string; pos: "before" | "after" } | { kind: "section"; id: string; pos: "start" | "end" };

const FIELD = "block text-[13px] font-semibold text-stone-700";
const ICON_BTN = "rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-30 disabled:hover:bg-transparent";

export default function PenaltyCatalogView() {
  const [data, setData] = useState<AdminData | null>(null);
  const [doc, setDoc] = useState<PenaltyCatalogDoc | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<DropOver | null>(null);
  const loadedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/penalty-catalog/admin", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as AdminData;
    if (!res.ok) {
      setLoadError(json.error ?? "Ошибка загрузки");
      return;
    }
    setLoadError(null);
    setData(json);
    setDoc(json.draft?.doc ?? json.published.doc);
    setSaveState("idle");
    loadedRef.current = false;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const validation = useMemo(() => (doc ? sanitizeCatalogDoc(doc) : null), [doc]);
  const diff = useMemo(() => (doc && data ? diffDocs(data.published.doc, doc) : null), [doc, data]);

  // Автосохранение черновика (1,5 с после последней правки) - только если справочник корректен.
  useEffect(() => {
    if (!doc || !validation) return;
    if (!loadedRef.current) {
      loadedRef.current = true; // первая загрузка - не сохраняем
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    if (!validation.ok) return;
    timer.current = setTimeout(async () => {
      const res = await fetch("/api/penalty-catalog/admin", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc }) });
      setSaveState(res.ok ? "saved" : "error");
    }, 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [doc, validation]);

  const update = (fn: (d: PenaltyCatalogDoc) => PenaltyCatalogDoc) => {
    setSaveState("saving");
    setDoc((d) => (d ? fn(d) : d));
  };
  const patchItem = (id: string, patch: Partial<CatalogItem>) => update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  function addItem(sectionId: string) {
    const newId = uid();
    update((d) => {
      const si = d.sections.findIndex((s) => s.id === sectionId);
      const mine = d.items.filter((i) => i.section === sectionId);
      const nums = mine.map((i) => Number(i.code.split(".")[1])).filter((n) => Number.isFinite(n));
      let n = (nums.length ? Math.max(...nums) : 0) + 1;
      let code = `${si + 1}.${n}`;
      while (d.items.some((i) => i.code === code)) code = `${si + 1}.${++n}`;
      const item: CatalogItem = { id: newId, code, stage: "Новый пункт", description: "Описание ошибки", severity: "Средняя", amount: 100, unit: "fixed", section: sectionId };
      const lastIdx = d.items.map((i) => i.section).lastIndexOf(sectionId);
      const items = [...d.items];
      items.splice(lastIdx >= 0 ? lastIdx + 1 : items.length, 0, item);
      return { ...d, items };
    });
    setSearch("");
    setOpenId(newId);
  }
  /** Перенос пункта (перетаскиванием): в раздел sectionId, перед пунктом beforeId (null = в конец раздела). */
  function moveTo(id: string, sectionId: string, beforeId: string | null) {
    if (beforeId === id) return;
    update((d) => {
      const item = d.items.find((i) => i.id === id);
      if (!item) return d;
      const rest = d.items.filter((i) => i.id !== id);
      let idx: number;
      if (beforeId) idx = rest.findIndex((i) => i.id === beforeId);
      else {
        const last = rest.map((i) => i.section).lastIndexOf(sectionId);
        idx = last >= 0 ? last + 1 : rest.length;
      }
      if (idx < 0) idx = rest.length;
      rest.splice(idx, 0, { ...item, section: sectionId });
      return { ...d, items: rest };
    });
  }
  function endDrag() {
    setDragId(null);
    setOver(null);
  }
  /** Сброс на пункт: вставка до него или после него (после = перед следующим пунктом раздела). */
  function dropOnItem(target: CatalogItem, pos: "before" | "after") {
    if (!dragId || !doc || dragId === target.id) return endDrag();
    let beforeId: string | null = target.id;
    if (pos === "after") {
      const mine = doc.items.filter((i) => i.section === target.section);
      const k = mine.findIndex((i) => i.id === target.id);
      beforeId = mine.slice(k + 1).find((i) => i.id !== dragId)?.id ?? null;
    }
    moveTo(dragId, target.section, beforeId);
    endDrag();
  }
  function moveItem(id: string, dir: -1 | 1) {
    update((d) => {
      const item = d.items.find((i) => i.id === id);
      if (!item) return d;
      const same = d.items.filter((i) => i.section === item.section);
      const pos = same.findIndex((i) => i.id === id);
      const other = same[pos + dir];
      if (!other) return d;
      const items = [...d.items];
      const a = items.findIndex((i) => i.id === id);
      const b = items.findIndex((i) => i.id === other.id);
      [items[a], items[b]] = [items[b], items[a]];
      return { ...d, items };
    });
  }
  function removeItem(item: CatalogItem) {
    if (!window.confirm(`Удалить пункт ${item.code} «${item.stage}»? После подтверждения его не будет в списке у контролёра (старые штрафы в журнале останутся).`)) return;
    update((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }));
    setOpenId(null);
  }
  function addSection() {
    update((d) => ({ ...d, sections: [...d.sections, { id: "s" + Math.random().toString(36).slice(2, 8), title: "Новый раздел" }] }));
  }
  function moveSection(id: string, dir: -1 | 1) {
    update((d) => {
      const i = d.sections.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= d.sections.length) return d;
      const sections = [...d.sections];
      [sections[i], sections[j]] = [sections[j], sections[i]];
      return { ...d, sections };
    });
  }
  function removeSection(id: string) {
    update((d) => (d.items.some((i) => i.section === id) ? d : { ...d, sections: d.sections.filter((s) => s.id !== id) }));
  }
  function renumberAll() {
    if (!window.confirm("Перенумеровать все пункты по порядку внутри разделов (1.1, 1.2, … 2.1, …)?")) return;
    update((d) => {
      const counters = new Map<string, number>();
      return {
        ...d,
        items: d.items.map((it) => {
          const si = d.sections.findIndex((s) => s.id === it.section);
          const n = (counters.get(it.section) ?? 0) + 1;
          counters.set(it.section, n);
          return { ...it, code: `${si + 1}.${n}` };
        }),
      };
    });
  }

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    const res = await fetch("/api/penalty-catalog/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; version?: number };
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: json.error ?? "Ошибка" });
      return false;
    }
    return true;
  }

  async function publish() {
    if (!doc || !validation?.ok) return;
    if (timer.current) clearTimeout(timer.current);
    if (await post({ action: "publish", doc, note })) {
      setMsg({ ok: true, text: "Справочник подтверждён. Теперь он действует у всех: у контролёра, в Primes & Bonus и у бригад." });
      setConfirming(false);
      setNote("");
      setOpenId(null);
      await load();
    }
  }
  async function discard() {
    if (!window.confirm("Отбросить все неподтверждённые изменения и вернуться к действующей версии?")) return;
    if (timer.current) clearTimeout(timer.current);
    if (await post({ action: "discard" })) {
      setMsg({ ok: true, text: "Изменения отброшены." });
      setConfirming(false);
      setOpenId(null);
      await load();
    }
  }
  async function restore(version: number) {
    if (!window.confirm(`Открыть версию ${version} как черновик? Текущий черновик будет заменён.`)) return;
    if (await post({ action: "restore", version })) {
      setMsg({ ok: true, text: `Версия ${version} открыта как черновик. Нажмите « Подтвердить », чтобы она снова начала действовать.` });
      setShowHistory(false);
      await load();
    }
  }

  if (loadError) return <p className="rounded-lg bg-error-50 p-3 text-sm text-error-700">{loadError}</p>;
  if (!data || !doc) return <p className="text-sm text-stone-400">Загрузка…</p>;

  const pub = data.published;
  const baseById = new Map(pub.doc.items.map((i) => [i.id, i]));
  const changeCount = diff ? diff.added.length + diff.removed.length + diff.changed.length + (diff.sectionsChanged ? 1 : 0) + (diff.reordered ? 1 : 0) : 0;
  const unconfirmed = !!diff?.any;
  const q = search.trim().toLowerCase();
  const matches = (i: CatalogItem) => !q || `${i.code} ${i.stage} ${i.description}`.toLowerCase().includes(q);
  const shownCount = doc.items.filter(matches).length;

  return (
    <div className="space-y-5 pb-4">
      {/* Шапка */}
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">Справочник штрафов</h2>
            <p className="mt-1 text-[15px] text-stone-600">
              {pub.version > 0 ? (
                <>
                  Действует <b className="text-stone-700">версия {pub.version}</b> · подтверждена {fmtDate(pub.publishedAt)}, {pub.publishedBy}
                </>
              ) : (
                <>Действует встроенный справочник, ещё не подтверждался.</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn gap-1.5 px-3 py-2 text-[15px]" onClick={() => setShowHistory((v) => !v)}>
              <History size={15} /> История ({data.history.length})
            </button>
            <button type="button" className="btn gap-1.5 px-3 py-2 text-[15px]" onClick={renumberAll} title="1.1, 1.2 … 2.1 … по порядку внутри разделов">
              <ListOrdered size={15} /> Перенумеровать
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="input w-full py-2 pl-9 text-[15px]" placeholder="Найти пункт: номер, этап, описание…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-[15px] text-stone-700" title="Сумма штрафа в справочнике - на команду; на человека она делится на это число">
            Делитель на человека
            <span className="text-stone-400">÷</span>
            <input type="number" min={1} className="input w-16 py-1.5 text-center text-sm font-semibold" value={doc.divisor} onChange={(e) => update((d) => ({ ...d, divisor: Number(e.target.value) }))} />
          </label>
        </div>

        <p className="text-sm leading-relaxed text-stone-600">
          Нажмите на пункт, чтобы изменить. Правки видны только вам, пока не нажата «Подтвердить»: после неё новый список сразу действует у контролёра, в Primes &amp; Bonus и у бригад. Уже внесённые штрафы не меняются.
        </p>

        {showHistory && (
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
            {data.history.length === 0 ? (
              <p className="text-sm text-stone-500">Подтверждённых версий ещё нет.</p>
            ) : (
              <ul className="divide-y divide-stone-200 text-sm">
                {data.history.map((h) => (
                  <li key={h.version} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <b className="w-8">v{h.version}</b>
                    <span className="text-stone-600">{fmtDate(h.published_at)}</span>
                    <span className="text-stone-600">{h.published_by_email}</span>
                    <span className="min-w-0 flex-1 text-stone-700">{h.note}</span>
                    {h.version === pub.version ? (
                      <span className="rounded-full bg-success-50 px-2 py-0.5 text-xs font-bold text-success-700">действует</span>
                    ) : (
                      <button type="button" className="text-sm font-bold text-primary-600 hover:text-primary-700" onClick={() => restore(h.version)}>
                        открыть как черновик
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Разделы */}
      {doc.sections.map((sec, si) => {
        const all = doc.items.filter((i) => i.section === sec.id);
        const items = all.filter(matches);
        if (q && items.length === 0) return null;
        return (
          <section key={sec.id} className="card overflow-hidden p-0">
            <div
              className={`group relative flex flex-wrap items-center gap-3 border-b border-stone-100 bg-stone-50/70 px-4 py-3 ${over?.kind === "section" && over.id === sec.id && over.pos === "start" ? "ring-2 ring-inset ring-primary-400" : ""}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOver({ kind: "section", id: sec.id, pos: "start" });
              }}
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const first = doc.items.find((i) => i.section === sec.id && i.id !== dragId);
                moveTo(dragId, sec.id, first?.id ?? null);
                endDrag();
              }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">{si + 1}</span>
              <input
                className="min-w-[12rem] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-bold tracking-tight outline-none transition hover:border-stone-200 focus:border-primary-400 focus:bg-white"
                value={sec.title}
                title="Нажмите, чтобы переименовать раздел"
                onChange={(e) => update((d) => ({ ...d, sections: d.sections.map((s) => (s.id === sec.id ? { ...s, title: e.target.value } : s)) }))}
              />
              <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-200">{all.length}</span>
              <div className="flex items-center opacity-60 transition group-hover:opacity-100">
                <button type="button" className={ICON_BTN} title="Раздел выше" disabled={si === 0} onClick={() => moveSection(sec.id, -1)}>
                  <ArrowUp size={15} />
                </button>
                <button type="button" className={ICON_BTN} title="Раздел ниже" disabled={si === doc.sections.length - 1} onClick={() => moveSection(sec.id, 1)}>
                  <ArrowDown size={15} />
                </button>
                {all.length === 0 && (
                  <button type="button" className={`${ICON_BTN} hover:!text-error-600`} title="Удалить пустой раздел" onClick={() => removeSection(sec.id)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            <ul className="divide-y divide-stone-100">
              {items.map((it, idx) => {
                const isNew = !baseById.has(it.id);
                const isChanged = !isNew && itemSig(it) !== itemSig(baseById.get(it.id)!);
                const open = openId === it.id;
                const sev = it.severity ? SEV[it.severity] : null;
                return (
                  <li
                    key={it.id}
                    className={`relative ${isNew ? "bg-success-50/40" : isChanged ? "bg-warning-50/40" : ""} ${dragId === it.id ? "opacity-40" : ""}`}
                    onDragOver={(e) => {
                      if (!dragId || dragId === it.id) return;
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      const pos = e.clientY < r.top + r.height / 2 ? "before" : "after";
                      setOver((cur) => (cur?.kind === "item" && cur.id === it.id && cur.pos === pos ? cur : { kind: "item", id: it.id, pos }));
                    }}
                    onDrop={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      dropOnItem(it, over?.kind === "item" && over.id === it.id ? over.pos : "before");
                    }}
                  >
                    {over?.kind === "item" && over.id === it.id && dragId !== it.id && (
                      <span className={`pointer-events-none absolute inset-x-3 z-10 h-[3px] rounded-full bg-primary-500 ${over.pos === "before" ? "-top-px" : "-bottom-px"}`} />
                    )}
                    {(isNew || isChanged) && <span className={`absolute inset-y-0 left-0 w-1 ${isNew ? "bg-success-500" : "bg-warning-500"}`} />}
                    {!q && (
                      <span
                        draggable
                        title="Перетащите, чтобы переставить пункт или перенести в другой раздел"
                        className="absolute left-1.5 top-3.5 z-10 flex h-7 w-5 cursor-grab items-center justify-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 active:cursor-grabbing"
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", it.id);
                          const row = e.currentTarget.closest("li");
                          if (row) e.dataTransfer.setDragImage(row, 24, 24);
                          setDragId(it.id);
                        }}
                        onDragEnd={endDrag}
                      >
                        <GripVertical size={16} />
                      </span>
                    )}
                    <button type="button" onClick={() => setOpenId(open ? null : it.id)} className={`flex w-full items-start gap-3 py-3 pr-4 text-left transition hover:bg-stone-50/80 ${q ? "pl-4" : "pl-9"}`}>
                      <span className="mt-0.5 w-12 shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-center font-mono text-sm font-semibold text-stone-700">{it.code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-base font-semibold leading-snug text-stone-900">{it.stage}</span>
                          {isNew && <span className="rounded bg-success-100 px-1.5 py-px text-xs font-bold uppercase text-success-700">новый</span>}
                          {isChanged && <span className="rounded bg-warning-100 px-1.5 py-px text-xs font-bold uppercase text-warning-800">изменён</span>}
                        </span>
                        <span className="mt-0.5 block text-[15px] leading-snug text-stone-700">{it.description}</span>
                        {it.note && <span className="mt-0.5 block text-sm text-stone-600">{it.note}</span>}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="whitespace-nowrap text-base font-bold tabular-nums text-stone-900">{priceText(it)}</span>
                        {sev ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] font-semibold ${sev.pill}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                            {it.severity}
                          </span>
                        ) : (
                          <span className="text-[13px] text-stone-500">без уровня</span>
                        )}
                      </span>
                      <ChevronDown size={16} className={`mt-1 shrink-0 text-stone-500 transition ${open ? "rotate-180" : ""}`} />
                    </button>

                    {open && (
                      <div className="border-t border-stone-100 bg-stone-50/60 px-4 pb-4 pt-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                          <label className="md:col-span-2">
                            <span className={FIELD}>Номер</span>
                            <input className="input mt-1 w-full py-2 font-mono text-[15px]" value={it.code} onChange={(e) => patchItem(it.id, { code: e.target.value })} />
                          </label>
                          <label className="md:col-span-4">
                            <span className={FIELD}>Этап</span>
                            <input className="input mt-1 w-full py-2 text-[15px] font-semibold" value={it.stage} onChange={(e) => patchItem(it.id, { stage: e.target.value })} />
                          </label>
                          <label className="md:col-span-3">
                            <span className={FIELD}>Серьёзность</span>
                            <select className="input mt-1 w-full py-2 text-[15px]" value={it.severity ?? ""} onChange={(e) => patchItem(it.id, { severity: (e.target.value || null) as PenaltySeverity | null })}>
                              <option value="">не указана</option>
                              {PENALTY_SEVERITIES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="md:col-span-3">
                            <span className={FIELD}>Раздел</span>
                            <select className="input mt-1 w-full py-2 text-[15px]" value={it.section} onChange={(e) => patchItem(it.id, { section: e.target.value })}>
                              {doc.sections.map((s, i) => (
                                <option key={s.id} value={s.id}>
                                  {i + 1}. {s.title}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="md:col-span-12">
                            <span className={FIELD}>Описание ошибки</span>
                            <textarea className="input mt-1 w-full py-2 text-[15px]" rows={2} value={it.description} onChange={(e) => patchItem(it.id, { description: e.target.value })} />
                          </label>

                          <label className="md:col-span-4">
                            <span className={FIELD}>Как считается</span>
                            <select
                              className="input mt-1 w-full py-2 text-[15px]"
                              value={it.unit}
                              onChange={(e) => {
                                const unit = e.target.value as PenaltyUnit;
                                patchItem(it.id, { unit, amountMax: unit === "range" ? (it.amountMax ?? it.amount) : undefined });
                              }}
                            >
                              {PENALTY_UNITS.map((u) => (
                                <option key={u.value} value={u.value}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="md:col-span-4">
                            <span className={FIELD}>{it.unit === "range" ? "Сумма от – до, € на команду" : it.unit === "per_piece" ? "€ за одну штуку" : it.unit === "per_day" ? "€ за один день" : "Сумма, € на команду"}</span>
                            {it.unit === "manual" ? (
                              <p className="mt-1 py-2 text-[15px] text-stone-500">Сумму вводит контролёр при проверке</p>
                            ) : (
                              <div className="mt-1 flex items-center gap-2">
                                <input type="number" min={0} step="any" className="input w-28 py-2 text-right text-[15px] font-semibold" value={it.amount} onChange={(e) => patchItem(it.id, { amount: Number(e.target.value) })} />
                                {it.unit === "range" && (
                                  <>
                                    <span className="text-stone-400">–</span>
                                    <input type="number" min={0} step="any" className="input w-28 py-2 text-right text-[15px] font-semibold" value={it.amountMax ?? it.amount} onChange={(e) => patchItem(it.id, { amountMax: Number(e.target.value) })} />
                                  </>
                                )}
                                {doc.divisor > 0 && it.amount > 0 && <span className="text-sm text-stone-500">≈ {eur(it.amount / doc.divisor)} на человека</span>}
                              </div>
                            )}
                          </div>
                          <label className="md:col-span-4">
                            <span className={FIELD}>Примечание</span>
                            <input className="input mt-1 w-full py-2 text-[15px]" placeholder="Видно контролёру и бригаде" value={it.note ?? ""} onChange={(e) => patchItem(it.id, { note: e.target.value || undefined })} />
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1">
                          <button type="button" className={ICON_BTN} title="Выше в разделе" disabled={idx === 0 || !!q} onClick={() => moveItem(it.id, -1)}>
                            <ArrowUp size={16} />
                          </button>
                          <button type="button" className={ICON_BTN} title="Ниже в разделе" disabled={idx === items.length - 1 || !!q} onClick={() => moveItem(it.id, 1)}>
                            <ArrowDown size={16} />
                          </button>
                          <button type="button" className={`${ICON_BTN} hover:!text-error-600`} title="Удалить пункт" onClick={() => removeItem(it)}>
                            <Trash2 size={16} />
                          </button>
                          <button type="button" className="btn ml-auto gap-1.5 px-3 py-1.5 text-[15px]" onClick={() => setOpenId(null)}>
                            <Check size={15} /> Готово
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!q && (
              <div
                className={dragId && over?.kind === "section" && over.id === sec.id && over.pos === "end" ? "ring-2 ring-inset ring-primary-400" : ""}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setOver({ kind: "section", id: sec.id, pos: "end" });
                }}
                onDrop={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  moveTo(dragId, sec.id, null);
                  endDrag();
                }}
              >
                <button type="button" onClick={() => addItem(sec.id)} className="flex w-full items-center gap-2 border-t border-stone-100 px-4 py-3.5 text-[15px] font-semibold text-primary-600 transition hover:bg-primary-50/50">
                  <Plus size={16} /> {dragId ? "Отпустите здесь, чтобы поставить в конец раздела" : "Добавить пункт в раздел"}
                </button>
              </div>
            )}
          </section>
        );
      })}

      {q && shownCount === 0 && <p className="py-8 text-center text-sm text-stone-400">Ничего не найдено</p>}

      {!q && (
        <button type="button" onClick={addSection} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-4 text-[15px] font-semibold text-stone-600 transition hover:border-primary-300 hover:text-primary-600">
          <Plus size={16} /> Добавить раздел
        </button>
      )}

      {diff && diff.removed.length > 0 && (
        <p className="text-sm text-stone-600">Будут удалены после подтверждения: {diff.removed.map((r) => `${r.code} ${r.stage}`).join("; ")}</p>
      )}

      {/* Нижняя панель: всегда на виду, пока есть неподтверждённые изменения */}
      {(unconfirmed || msg) && (
        <div className="sticky bottom-4 z-20">
          <div className="mx-auto max-w-3xl space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
            {msg && !unconfirmed && <p className={`text-sm font-semibold ${msg.ok ? "text-success-700" : "text-error-700"}`}>{msg.text}</p>}
            {msg && unconfirmed && !msg.ok && <p className="text-sm font-semibold text-error-700">{msg.text}</p>}
            {validation && !validation.ok && <p className="text-sm font-semibold text-error-700">{validation.error}</p>}

            {unconfirmed && !confirming && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-stone-900">Не подтверждено · изменений: {changeCount}</p>
                  <p className="text-sm text-stone-600">
                    {validation && !validation.ok
                      ? "Черновик не сохранён - исправьте ошибку"
                      : saveState === "saving"
                        ? "Сохраняю черновик…"
                        : saveState === "error"
                          ? "Не удалось сохранить черновик"
                          : "Черновик сохранён, видите его только вы"}
                  </p>
                </div>
                <button type="button" className="btn gap-1.5 px-3 py-2 text-[15px]" disabled={busy} onClick={discard}>
                  <Undo2 size={15} /> Отменить
                </button>
                <button type="button" className="btn btn-primary gap-1.5 px-4 py-2 text-[15px]" disabled={!validation?.ok || busy} onClick={() => setConfirming(true)}>
                  <Check size={15} /> Подтвердить для всех
                </button>
              </div>
            )}

            {unconfirmed && confirming && diff && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-stone-900">Применить новый справочник для всех?</p>
                <div className="flex flex-wrap gap-2 text-sm">
                  {diff.added.length > 0 && <span className="rounded-full bg-success-50 px-2.5 py-1 font-semibold text-success-700">новых: {diff.added.length}</span>}
                  {diff.changed.length > 0 && <span className="rounded-full bg-warning-50 px-2.5 py-1 font-semibold text-warning-800">изменено: {diff.changed.length}</span>}
                  {diff.removed.length > 0 && <span className="rounded-full bg-error-50 px-2.5 py-1 font-semibold text-error-700">удалено: {diff.removed.length}</span>}
                  {diff.sectionsChanged && <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-600">разделы / делитель</span>}
                  {diff.reordered && <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-stone-600">изменён порядок пунктов</span>}
                </div>
                <p className="text-sm text-stone-600">Контролёр, который сейчас заполняет проверку, получит просьбу обновить страницу и отметить ошибки заново. Уже внесённые штрафы останутся как есть.</p>
                <input className="input w-full py-2 text-[15px]" placeholder="Комментарий к версии (необязательно): что изменили" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <button type="button" className="btn btn-primary gap-1.5 px-4 py-2 text-[15px]" disabled={busy} onClick={publish}>
                    <Check size={15} /> Да, подтвердить
                  </button>
                  <button type="button" className="btn px-3 py-2 text-[15px]" onClick={() => setConfirming(false)}>
                    Назад
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
