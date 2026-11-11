"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const SEV_CLASS: Record<string, string> = {
  Критическая: "bg-error-50 text-error-700",
  Серьёзная: "bg-warning-50 text-warning-800",
  Средняя: "bg-primary-50 text-primary-700",
  Малая: "bg-stone-100 text-stone-600",
};

const uid = () => "n:" + Math.random().toString(36).slice(2, 10);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "");
const itemSig = (i: CatalogItem) => JSON.stringify([i.code, i.stage, i.description, i.severity, i.amount, i.amountMax ?? null, i.unit, i.note ?? "", i.section]);

function diffDocs(base: PenaltyCatalogDoc, next: PenaltyCatalogDoc) {
  const baseById = new Map(base.items.map((i) => [i.id, i]));
  const nextById = new Map(next.items.map((i) => [i.id, i]));
  const added = next.items.filter((i) => !baseById.has(i.id)).map((i) => i.id);
  const removed = base.items.filter((i) => !nextById.has(i.id));
  const changed = next.items.filter((i) => baseById.has(i.id) && itemSig(i) !== itemSig(baseById.get(i.id)!)).map((i) => i.id);
  const sectionsChanged = JSON.stringify(base.sections) !== JSON.stringify(next.sections) || base.divisor !== next.divisor;
  return { added, removed, changed, sectionsChanged, any: added.length + removed.length + changed.length > 0 || sectionsChanged };
}

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
    update((d) => {
      const si = d.sections.findIndex((s) => s.id === sectionId);
      const mine = d.items.filter((i) => i.section === sectionId);
      const nums = mine.map((i) => Number(i.code.split(".")[1])).filter((n) => Number.isFinite(n));
      let n = (nums.length ? Math.max(...nums) : 0) + 1;
      let code = `${si + 1}.${n}`;
      while (d.items.some((i) => i.code === code)) code = `${si + 1}.${++n}`;
      const item: CatalogItem = { id: uid(), code, stage: "Новый пункт", description: "Описание ошибки", severity: "Средняя", amount: 100, unit: "fixed", section: sectionId };
      // вставить после последнего пункта этого раздела
      const lastIdx = d.items.map((i) => i.section).lastIndexOf(sectionId);
      const items = [...d.items];
      items.splice(lastIdx >= 0 ? lastIdx + 1 : items.length, 0, item);
      return { ...d, items };
    });
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
      await load();
    }
  }
  async function discard() {
    if (!window.confirm("Отбросить все неподтверждённые изменения и вернуться к действующей версии?")) return;
    if (timer.current) clearTimeout(timer.current);
    if (await post({ action: "discard" })) {
      setMsg({ ok: true, text: "Изменения отброшены." });
      setSaveState("idle");
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
  const base = pub.doc;
  const baseById = new Map(base.items.map((i) => [i.id, i]));
  const changeCount = diff ? diff.added.length + diff.removed.length + diff.changed.length + (diff.sectionsChanged ? 1 : 0) : 0;
  const unconfirmed = !!diff?.any;

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Справочник штрафов контролёра</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {pub.version > 0 ? (
                <>
                  Действует версия <b>{pub.version}</b>, подтверждена {fmtDate(pub.publishedAt)} ({pub.publishedBy}).
                </>
              ) : (
                <>Сейчас действует встроенный справочник - в приложении он ещё ни разу не подтверждался.</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {unconfirmed ? (
              <span className="rounded-full bg-warning-50 px-2.5 py-1 text-xs font-bold text-warning-800">Не подтверждено · изменений: {changeCount}</span>
            ) : (
              <span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-bold text-success-700">Совпадает с действующим</span>
            )}
            <span className="text-[11px] text-stone-400">
              {validation && !validation.ok && saveState !== "idle" && "не сохранено: исправьте ошибку"}
              {validation?.ok && saveState === "saving" && "сохраняю черновик…"}
              {validation?.ok && saveState === "saved" && "черновик сохранён"}
              {validation?.ok && saveState === "error" && "не удалось сохранить черновик"}
            </span>
          </div>
        </div>

        <p className="text-xs text-stone-500">
          Здесь можно менять номера, разделы, названия, серьёзность, суммы и добавлять новые пункты. Изменения пока видны только вам. Они начнут действовать у{" "}
          <b>всех</b> (контролёр, Primes &amp; Bonus, страница бригады) после кнопки «Подтвердить». Уже внесённые штрафы не меняются.
        </p>

        {validation && !validation.ok && <p className="rounded-lg bg-error-50 p-2 text-xs font-semibold text-error-700">{validation.error}</p>}
        {msg && <p className={`rounded-lg p-2 text-xs font-semibold ${msg.ok ? "bg-success-50 text-success-700" : "bg-error-50 text-error-700"}`}>{msg.text}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary px-4 py-2 text-sm" disabled={!unconfirmed || !validation?.ok || busy} onClick={() => setConfirming(true)}>
            Подтвердить и применить для всех
          </button>
          <button type="button" className="btn px-3 py-2 text-sm" disabled={!unconfirmed || busy} onClick={discard}>
            Отменить изменения
          </button>
          <button type="button" className="btn px-3 py-2 text-sm" onClick={renumberAll}>
            Перенумеровать по порядку
          </button>
          <button type="button" className="btn px-3 py-2 text-sm" onClick={() => setShowHistory((v) => !v)}>
            История версий ({data.history.length})
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-stone-500" title="Сумма штрафа в таблице - на команду; на человека она делится на это число">
            Делитель на человека ÷
            <input
              type="number"
              min={1}
              className="input w-16 py-1 text-sm"
              value={doc.divisor}
              onChange={(e) => update((d) => ({ ...d, divisor: Number(e.target.value) }))}
            />
          </label>
        </div>

        {confirming && diff && (
          <div className="space-y-2 rounded-xl border border-warning-300 bg-warning-50/60 p-3 text-sm">
            <p className="font-bold">Применить новый справочник для всех?</p>
            <ul className="list-disc pl-5 text-xs text-stone-700">
              {diff.added.length > 0 && <li>Новых пунктов: {diff.added.length}</li>}
              {diff.changed.length > 0 && <li>Изменено пунктов: {diff.changed.length}</li>}
              {diff.removed.length > 0 && <li>Удалено пунктов: {diff.removed.length} ({diff.removed.map((r) => r.code).join(", ")})</li>}
              {diff.sectionsChanged && <li>Изменены разделы или делитель</li>}
            </ul>
            <p className="text-xs text-stone-600">
              Контролёр, который сейчас заполняет проверку, получит просьбу обновить страницу и отметить ошибки заново. Уже внесённые штрафы останутся как есть.
            </p>
            <input className="input w-full py-1 text-sm" placeholder="Комментарий к версии (необязательно): что изменили" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary px-4 py-1.5 text-sm" disabled={busy} onClick={publish}>
                Да, подтвердить
              </button>
              <button type="button" className="btn px-3 py-1.5 text-sm" onClick={() => setConfirming(false)}>
                Отмена
              </button>
            </div>
          </div>
        )}

        {showHistory && (
          <div className="rounded-xl border border-stone-200 p-3">
            {data.history.length === 0 ? (
              <p className="text-xs text-stone-400">Подтверждённых версий ещё нет.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.version} className="border-b border-stone-100 last:border-0">
                      <td className="py-1.5 pr-3 font-bold">v{h.version}</td>
                      <td className="py-1.5 pr-3 text-stone-500">{fmtDate(h.published_at)}</td>
                      <td className="py-1.5 pr-3 text-stone-500">{h.published_by_email}</td>
                      <td className="py-1.5 pr-3 text-stone-700">{h.note}</td>
                      <td className="py-1.5 text-right">
                        {h.version !== pub.version && (
                          <button type="button" className="font-bold text-primary-600 hover:text-primary-700" onClick={() => restore(h.version)}>
                            открыть как черновик
                          </button>
                        )}
                        {h.version === pub.version && <span className="text-success-700">действует</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {doc.sections.map((sec, si) => {
        const items = doc.items.filter((i) => i.section === sec.id);
        return (
          <div key={sec.id} className="card overflow-x-auto p-0">
            <div className="flex flex-wrap items-center gap-2 bg-stone-100 px-3 py-2">
              <span className="text-sm font-bold text-stone-500">{si + 1}.</span>
              <input
                className="input min-w-[16rem] flex-1 py-1 text-sm font-bold"
                value={sec.title}
                onChange={(e) => update((d) => ({ ...d, sections: d.sections.map((s) => (s.id === sec.id ? { ...s, title: e.target.value } : s)) }))}
              />
              <button type="button" className="px-1.5 text-stone-500 hover:text-stone-800" title="Раздел выше" onClick={() => moveSection(sec.id, -1)} disabled={si === 0}>
                ↑
              </button>
              <button type="button" className="px-1.5 text-stone-500 hover:text-stone-800" title="Раздел ниже" onClick={() => moveSection(sec.id, 1)} disabled={si === doc.sections.length - 1}>
                ↓
              </button>
              {items.length === 0 && (
                <button type="button" className="text-xs text-stone-400 hover:text-error-600" onClick={() => removeSection(sec.id)}>
                  удалить раздел
                </button>
              )}
            </div>
            <table className="w-full min-w-[1500px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase text-stone-400">
                  <th className="w-20 px-2 py-1.5">№</th>
                  <th className="w-44 px-2 py-1.5">Этап</th>
                  <th className="min-w-[26rem] px-2 py-1.5">Описание ошибки</th>
                  <th className="w-32 px-2 py-1.5">Серьёзность</th>
                  <th className="w-44 px-2 py-1.5">Как считается</th>
                  <th className="w-36 px-2 py-1.5">Сумма, € на команду</th>
                  <th className="w-48 px-2 py-1.5">Примечание</th>
                  <th className="w-40 px-2 py-1.5">Раздел</th>
                  <th className="w-20 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const isNew = !baseById.has(it.id);
                  const isChanged = !isNew && itemSig(it) !== itemSig(baseById.get(it.id)!);
                  return (
                    <tr key={it.id} className={`border-t border-stone-100 align-top ${isNew ? "bg-success-50/60" : isChanged ? "bg-warning-50/60" : ""}`}>
                      <td className="px-2 py-1.5">
                        <input className="input w-[4.5rem] py-0.5 text-sm font-mono" value={it.code} onChange={(e) => patchItem(it.id, { code: e.target.value })} />
                        {isNew && <span className="mt-0.5 block text-[9px] font-bold uppercase text-success-700">новый</span>}
                        {isChanged && <span className="mt-0.5 block text-[9px] font-bold uppercase text-warning-700">изменён</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <input className="input w-full py-0.5 text-sm font-semibold" value={it.stage} onChange={(e) => patchItem(it.id, { stage: e.target.value })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <textarea
                          className="input w-full py-0.5 text-sm"
                          rows={Math.max(1, Math.min(4, Math.ceil(it.description.length / 60)))}
                          value={it.description}
                          onChange={(e) => patchItem(it.id, { description: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className={`input w-full py-0.5 text-xs font-semibold ${it.severity ? SEV_CLASS[it.severity] : ""}`}
                          value={it.severity ?? ""}
                          onChange={(e) => patchItem(it.id, { severity: (e.target.value || null) as PenaltySeverity | null })}
                        >
                          <option value="">не указана</option>
                          {PENALTY_SEVERITIES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className="input w-full py-0.5 text-xs"
                          value={it.unit}
                          onChange={(e) => {
                            const unit = e.target.value as PenaltyUnit;
                            patchItem(it.id, { unit, ...(unit === "range" ? { amountMax: it.amountMax ?? it.amount } : { amountMax: undefined }) });
                          }}
                        >
                          {PENALTY_UNITS.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        {it.unit === "manual" ? (
                          <span className="text-xs text-stone-400">вводит контролёр</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="input w-20 py-0.5 text-right text-sm"
                              value={it.amount}
                              title={it.unit === "range" ? "Минимум" : it.unit === "per_piece" ? "За одну штуку" : it.unit === "per_day" ? "За один день" : "На команду"}
                              onChange={(e) => patchItem(it.id, { amount: Number(e.target.value) })}
                            />
                            {it.unit === "range" && (
                              <>
                                <span className="text-stone-400">–</span>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  className="input w-20 py-0.5 text-right text-sm"
                                  value={it.amountMax ?? it.amount}
                                  title="Максимум"
                                  onChange={(e) => patchItem(it.id, { amountMax: Number(e.target.value) })}
                                />
                              </>
                            )}
                          </div>
                        )}
                        {it.unit !== "manual" && it.amount > 0 && doc.divisor > 0 && (
                          <span className="mt-0.5 block text-[10px] text-stone-400">на человека ≈ {Math.round((it.amount / doc.divisor) * 100) / 100} €</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input className="input w-full py-0.5 text-xs" value={it.note ?? ""} placeholder="—" onChange={(e) => patchItem(it.id, { note: e.target.value || undefined })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select className="input w-full py-0.5 text-xs" value={it.section} onChange={(e) => patchItem(it.id, { section: e.target.value })}>
                          {doc.sections.map((s, i) => (
                            <option key={s.id} value={s.id}>
                              {i + 1}. {s.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        <button type="button" className="px-1 text-stone-400 hover:text-stone-800 disabled:opacity-30" title="Выше" disabled={idx === 0} onClick={() => moveItem(it.id, -1)}>
                          ↑
                        </button>
                        <button type="button" className="px-1 text-stone-400 hover:text-stone-800 disabled:opacity-30" title="Ниже" disabled={idx === items.length - 1} onClick={() => moveItem(it.id, 1)}>
                          ↓
                        </button>
                        <button type="button" className="px-1 text-stone-400 hover:text-error-600" title="Удалить пункт" onClick={() => removeItem(it)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={9} className="px-2 py-2">
                    <button type="button" className="text-xs font-bold text-primary-600 hover:text-primary-700" onClick={() => addItem(sec.id)}>
                      + пункт в этот раздел
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      <div>
        <button type="button" className="text-xs font-bold text-primary-600 hover:text-primary-700" onClick={addSection}>
          + раздел
        </button>
      </div>

      {diff && diff.removed.length > 0 && (
        <Fragment>
          <p className="text-xs text-stone-500">
            Будут удалены после подтверждения: {diff.removed.map((r) => `${r.code} ${r.stage}`).join("; ")}
          </p>
        </Fragment>
      )}
    </div>
  );
}
