"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { parseBankFile, toRows } from "@/lib/voldis/bank-import";
import { categoryFor } from "@/lib/voldis/bank-import";
import { analyzeTxs, cleanLabel, proposeMatches, type Proposal } from "@/lib/voldis/matching";
import { num, remaining, round2, statusFor, type VBankTx } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { Field, Menu, Modal, eur, frDate, todayIso } from "../ui";

// ───────────────────────── Banque (Crédit Agricole) ─────────────────────────

export default function Bank({ supabase, data }: { supabase: Supabase; data: VoldisData }) {
  const { txs, charges, tenants, reload: onChanged } = data;
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const [importing, setImporting] = useState(false);
  const [pw, setPw] = useState<{
    configured: boolean;
    connected: boolean;
    lastSync?: string | null;
    connections?: { id: number; state: string | null; bank: string | null }[];
    error?: string;
  } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "check" | "credit" | "debit" | "todo">("all");
  const [limit, setLimit] = useState(40);
  // largeurs des colonnes réglables à la souris (la colonne « Opération » prend le reste), mémorisées dans le navigateur
  const [cols, setCols] = useState<{ date: number; amount: number; who: number }>(() => {
    const fallback = { date: 96, amount: 128, who: 340 };
    if (typeof window === "undefined") return fallback;
    try {
      const saved = JSON.parse(window.localStorage.getItem("voldis_bank_cols") ?? "null");
      return saved && typeof saved.date === "number" ? { ...fallback, ...saved } : fallback;
    } catch {
      return fallback;
    }
  });
  const drag = useRef<{ key: "date" | "amount" | "who"; startX: number; startW: number; dir: 1 | -1 } | null>(null);

  function startResize(key: "date" | "amount" | "who", e: React.PointerEvent) {
    e.preventDefault();
    // « Locataire / catégorie » est tirée vers la gauche pour s'agrandir au détriment de « Opération »
    drag.current = { key, startX: e.clientX, startW: cols[key], dir: key === "who" ? -1 : 1 };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const w = Math.min(700, Math.max(64, d.startW + d.dir * (ev.clientX - d.startX)));
      setCols((prev) => ({ ...prev, [d.key]: w }));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setCols((prev) => {
        try {
          window.localStorage.setItem("voldis_bank_cols", JSON.stringify(prev));
        } catch {
          /* stockage indisponible : les largeurs ne sont simplement pas mémorisées */
        }
        return prev;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  useEffect(() => {
    fetch("/api/voldis/powens/status")
      .then((r) => r.json())
      .then((j) => setPw(j))
      .catch(() => setPw({ configured: false, connected: false }));
    const q = new URLSearchParams(window.location.search).get("voldis_bank");
    if (q) {
      if (q === "ok") toast.success("Crédit Agricole подключён");
      else toast.error("Не удалось подключить банк");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function powensConnect() {
    setPwBusy(true);
    try {
      const res = await fetch("/api/voldis/powens/connect", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      window.location.href = j.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка Powens");
      setPwBusy(false);
    }
  }

  async function powensSync() {
    setPwBusy(true);
    try {
      const res = await fetch("/api/voldis/powens/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(`Банк: новых операций ${j.added}`);
      await onChanged();
      setPw((p) => (p ? { ...p, lastSync: new Date().toISOString() } : p));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка Powens");
    } finally {
      setPwBusy(false);
    }
  }

  const needsReconnect = !!pw?.connections?.some((c) => c.state);
  const proposals = useMemo(() => proposeMatches(txs, charges, tenants), [txs, charges, tenants]);
  const sure = proposals.filter((p) => p.confidence === "sure");
  const [assigning, setAssigning] = useState<VBankTx | null>(null);
  const [applying, setApplying] = useState(false);
  const account = txs.find((t) => t.bank_account);
  const income = round2(txs.filter((t) => t.side === "credit").reduce((s, t) => s + num(t.amount), 0));
  const spent = round2(txs.filter((t) => t.side === "debit").reduce((s, t) => s + num(t.amount), 0));
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    txs.filter((t) => t.side === "debit" && t.category).forEach((t) => m.set(t.category!, round2((m.get(t.category!) ?? 0) + num(t.amount))));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [txs]);

  async function readText(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const utf8 = new TextDecoder("utf-8").decode(buf);
    // Les exports bancaires sont souvent en Windows-1252 : on retombe dessus si l'UTF-8 est cassé.
    return utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(buf) : utf8;
  }

  async function onFile(file: File) {
    setImporting(true);
    try {
      const parsed = parseBankFile(file.name, await readText(file));
      if (parsed.length === 0) throw new Error("В файле нет операций");
      const known = new Set(txs.map((t) => t.external_id));
      const rows = toRows(parsed, "import").map((r) => ({ ...r, bank_account: account?.bank_account ?? null, iban: account?.iban ?? null }));
      const fresh = rows.filter((r) => !known.has(r.external_id));
      if (fresh.length > 0) {
        const { error } = await supabase.from("voldis_bank_transactions").upsert(fresh, { onConflict: "external_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      toast.success(`Новых операций: ${fresh.length}, уже были: ${rows.length - fresh.length}`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setImporting(false);
    }
  }

  /** Applique une proposition : rattachement seul, enregistrement du paiement, ou attribution au locataire. */
  async function apply(p: Proposal): Promise<boolean> {
    if (p.kind === "pay") {
      const paid = round2(num(p.charge.amount_paid) + num(p.tx.amount));
      const paidOn = (p.tx.settled_at ?? todayIso()).slice(0, 10);
      const { error } = await supabase
        .from("voldis_charges")
        .update({ amount_paid: paid, paid_on: paidOn, status: statusFor({ ...p.charge, amount_paid: paid }) })
        .eq("id", p.charge.id);
      if (error) {
        toast.error("Ошибка: " + error.message);
        return false;
      }
    }
    const patch = p.kind === "assign" ? { tenant_id: p.tenant.id } : { tenant_id: p.tenant.id, charge_id: p.charge.id };
    const { error } = await supabase.from("voldis_bank_transactions").update(patch).eq("id", p.tx.id);
    if (error) {
      toast.error("Ошибка: " + error.message);
      return false;
    }
    return true;
  }

  async function applyOne(p: Proposal) {
    setApplying(true);
    if (await apply(p)) toast.success("Сопоставлено");
    setApplying(false);
    await onChanged();
  }

  async function applySure() {
    const nPay = sure.filter((p) => p.kind === "pay").length;
    if (!window.confirm(`Подтвердить ${sure.length} надёжных сопоставлений?${nPay ? ` Из них записей оплаты: ${nPay}.` : ""}`)) return;
    setApplying(true);
    let ok = 0;
    for (const p of sure) if (await apply(p)) ok++;
    setApplying(false);
    toast.success(`Сопоставлено: ${ok} из ${sure.length}`);
    await onChanged();
  }

  async function assign(tx: VBankTx, tenantId: string | null, category: string | null) {
    const { error } = await supabase.from("voldis_bank_transactions").update({ tenant_id: tenantId, category: category ?? tx.category }).eq("id", tx.id);
    if (error) return toast.error("Ошибка: " + error.message);
    setAssigning(null);
    await onChanged();
  }

  async function unlink(tx: VBankTx) {
    // on retire seulement le rattachement : les montants de l'échéance ne sont pas modifiés
    const { error } = await supabase.from("voldis_bank_transactions").update({ tenant_id: null, charge_id: null }).eq("id", tx.id);
    if (error) return toast.error("Ошибка: " + error.message);
    await onChanged();
  }

  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const flags = useMemo(() => analyzeTxs(txs, charges, tenants), [txs, charges, tenants]);
  const shown = txs.filter((t) => (filter === "all" ? true : filter === "check" ? flags.has(t.id) : filter === "todo" ? t.side === "credit" && !t.charge_id && !t.tenant_id : t.side === filter));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="font-bold text-stone-800">{account?.bank_account ?? "Crédit Agricole"}</p>
            <p className="text-xs text-stone-500">
              {account?.iban ?? "Загрузите выписку, чтобы начать"} · операций: {txs.length}
            </p>
          </div>
          <label className={`btn btn-primary ml-auto cursor-pointer ${importing ? "opacity-60" : ""}`}>
            {importing ? "Импорт..." : "Загрузить выписку"}
            <input
              type="file"
              accept=".ofx,.qif,.csv,.txt"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onFile(f);
              }}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-stone-800">
              Автоматическая синхронизация
            </p>
            <p className="text-xs text-stone-500">
              {pw === null
                ? "Проверка..."
                : !pw.configured
                ? "Powens ещё не настроен на сервере"
                : !pw.connected
                ? "Банк не подключён"
                : needsReconnect
                ? "Нужно заново подтвердить доступ к банку"
                : `Подключено · каждый день в 7:00 · последняя синхронизация: ${pw.lastSync ? frDate(pw.lastSync) : "-"}`}
              {pw?.error && <span className="ml-1 text-error-600">· {pw.error}</span>}
            </p>
          </div>
          {pw?.configured && (!pw.connected || needsReconnect) && (
            <button className="btn btn-dark" disabled={pwBusy} onClick={() => void powensConnect()}>
              {pw.connected ? "Переподключить" : "Подключить Crédit Agricole"}
            </button>
          )}
          {pw?.configured && pw.connected && (
            <button className="btn btn-secondary" disabled={pwBusy} onClick={() => void powensSync()}>
              Синхронизировать сейчас
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Crédit Agricole → онлайн-банк → скачать операции (OFX, QIF или CSV). Уже загруженные операции пропускаются.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 px-3 py-2">
            <div className="text-[11px] font-bold uppercase text-emerald-800">
              Поступления
            </div>
            <div className="text-lg font-extrabold tabular-nums text-emerald-800">{eur(income)}</div>
          </div>
          <div className="rounded-xl bg-stone-100 px-3 py-2">
            <div className="text-[11px] font-bold uppercase text-stone-600">
              Расходы
            </div>
            <div className="text-lg font-extrabold tabular-nums text-stone-700">{eur(spent)}</div>
          </div>
        </div>
        {byCategory.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {byCategory.map(([cat, total]) => (
              <span key={cat} className="badge badge-neutral">
                {cat}
                <strong className="ml-1 tabular-nums">{eur(total)}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {proposals.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold text-stone-800">
              {`Предложения по сопоставлению (${proposals.length})`}
            </p>
            {sure.length > 0 && (
              <button className="btn btn-dark" disabled={applying} onClick={() => void applySure()}>
                {`Подтвердить надёжные (${sure.length})`}
              </button>
            )}
          </div>
          <ul className="divide-y divide-stone-100">
            {proposals.slice(0, 40).map((p) => (
              <li key={p.tx.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${p.confidence === "sure" ? "bg-emerald-500" : "bg-amber-500"}`} title={p.confidence === "sure" ? "Надёжно" : "Проверить"} />
                <span className="w-24 shrink-0 tabular-nums font-bold text-stone-800">{eur(num(p.tx.amount))}</span>
                <span className="w-20 shrink-0 text-stone-400">{frDate(p.tx.settled_at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-stone-800">{p.tenant.name}</span>
                  <span className="text-stone-500">
                    {p.kind === "assign" ? " · без платежа (закрепить за арендатором)" : p.kind === "link" ? ` · платёж за ${frDate(p.charge.due_date)} уже оплачен` : ` · аренда за ${frDate(p.charge.due_date)} (осталось ${eur(remaining(p.charge))})`}
                  </span>
                  <span className="block truncate text-xs text-stone-400">{p.reason}</span>
                </span>
                <button className="btn btn-secondary px-3 py-1 text-xs" disabled={applying} onClick={() => void applyOne(p)}>
                  {p.kind === "pay" ? "Записать оплату" : p.kind === "link" ? "Привязать" : "Закрепить"}
                </button>
              </li>
            ))}
          </ul>
          {proposals.length > 40 && <p className="pt-3 text-xs text-stone-400">... и ещё {proposals.length - 40}: сначала подтвердите эти.</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Все"],
              ["check", `Проверить (${flags.size})`],
              ["credit", "Поступления"],
              ["debit", "Расходы"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-stone-400">
          <span className="mr-4">Серым: распознано автоматически</span>
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">Подсвечено: нужно проверить</span>
        </p>
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: cols.date }} />
            <col />
            <col style={{ width: cols.amount }} />
            <col style={{ width: cols.who }} />
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
              <th className="relative px-2 py-2">
                Дата
                <ResizeHandle onPointerDown={(e) => startResize("date", e)} />
              </th>
              <th className="px-2 py-2">Операция</th>
              <th className="relative px-2 py-2 text-right">
                Сумма
                <ResizeHandle onPointerDown={(e) => startResize("amount", e)} />
              </th>
              <th className="relative px-2 py-2">
                <ResizeHandle left onPointerDown={(e) => startResize("who", e)} />
                Арендатор / категория
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((t) => {
              const c = t.charge_id ? chargeById.get(t.charge_id) : null;
              const flag = flags.get(t.id);
              const who = c ? `${tenantName.get(c.tenant_id ?? "") ?? ""} · ${frDate(c.due_date)}` : t.tenant_id ? tenantName.get(t.tenant_id) : t.category ?? categoryFor(t.label ?? "") ?? "";
              return (
                <tr key={t.id} className={flag ? "bg-amber-50/70" : "border-b border-stone-50"}>
                  <td className={`whitespace-nowrap px-2 py-2.5 ${flag ? "text-stone-600" : "text-stone-400"}`}>{frDate(t.settled_at)}</td>
                  <td className={`break-words px-2 py-2.5 ${flag ? "font-medium text-stone-900" : "text-stone-500"}`} title={t.label ?? ""}>
                    {cleanLabel(t.label ?? t.reference)}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-2.5 text-right tabular-nums ${flag ? "font-bold" : "font-medium"} ${t.side === "credit" ? (flag ? "text-emerald-800" : "text-emerald-700/70") : flag ? "text-red-700" : "text-red-500/70"}`}>
                    {t.side === "credit" ? "+" : "−"}
                    {eur(num(t.amount))}
                  </td>
                  <td className="break-words px-2 py-2.5 text-xs" title={flag?.reason ?? who}>
                    {flag ? (
                      <span className="font-semibold text-amber-800">
                        {who && <span className="mr-1.5 font-normal text-stone-500">{who} ·</span>}
                        {flag.reason}
                      </span>
                    ) : (
                      <span className="text-stone-400">{who}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {t.side === "credit" && (
                      <Menu
                        items={[
                          { label: "Закрепить за арендатором...", onClick: () => setAssigning(t) },
                          ...(t.tenant_id || t.charge_id ? [{ label: "Снять привязку", onClick: () => void unlink(t) }] : []),
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-stone-400">
                  {filter === "check" ? "Проверять нечего: всё распознано" : "Операций нет"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {shown.length > limit && (
          <div className="pt-4 text-center">
            <button className="btn btn-secondary" onClick={() => setLimit(limit + 80)}>
              {`Показать ещё (${shown.length - limit})`}
            </button>
          </div>
        )}
      </div>
      {assigning && <AssignModal tx={assigning} tenants={tenants} onClose={() => setAssigning(null)} onSave={(tid, cat) => void assign(assigning, tid, cat)} />}
    </div>
  );
}

const CATEGORIES = ["Аренда", "Депозит", "Возврат", "Другое"];

function AssignModal({ tx, tenants, onClose, onSave }: { tx: VBankTx; tenants: VoldisData["tenants"]; onClose: () => void; onSave: (tenantId: string | null, category: string | null) => void }) {
  const [tenantId, setTenantId] = useState(tx.tenant_id ?? "");
  const [category, setCategory] = useState(tx.category ?? "Аренда");
  return (
    <Modal open onClose={onClose} title="Закрепить поступление">
      <p className="mb-4 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
        <strong className="tabular-nums text-stone-900">{eur(num(tx.amount))}</strong> · {frDate(tx.settled_at)}
        <span className="mt-1 block truncate text-xs text-stone-400">{tx.label}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="" ru="Арендатор">
          <select className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">- Никто (не аренда) -</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="" ru="Категория">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <p className="mt-3 text-xs text-stone-400">Следующие платежи этого плательщика будут предлагаться для этого арендатора автоматически.</p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose}>
          Отмена
        </button>
        <button className="btn btn-primary" onClick={() => onSave(tenantId || null, category)}>
          Сохранить
        </button>
      </div>
    </Modal>
  );
}

/** Poignée de redimensionnement d'une colonne : on la tire à la souris (ou au doigt) pour élargir. */
function ResizeHandle({ onPointerDown, left }: { onPointerDown: (e: React.PointerEvent) => void; left?: boolean }) {
  return (
    <span
      onPointerDown={onPointerDown}
      style={{ touchAction: "none" }}
      title="Потяните, чтобы изменить ширину"
      className={`absolute top-0 h-full w-2 cursor-col-resize select-none hover:bg-stone-300 ${left ? "left-0" : "right-0"}`}
    />
  );
}
