"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/Toast";
import { parseBankFile, toRows } from "@/lib/voldis/bank-import";
import {
  PROPERTY_STATUS_LABEL,
  STATUS_LABEL,
  monthEnd,
  num,
  remaining,
  round2,
  statusFor,
  suggestMatches,
  type ChargeStatus,
  type VBankTx,
  type VCharge,
  type VLease,
  type VProperty,
  type VTenant,
} from "@/lib/voldis/rental";

type Supabase = ReturnType<typeof createClient>;
type Tab = "loyers" | "biens" | "locataires" | "baux" | "banque";

const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const frDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const todayIso = () => new Date().toISOString().slice(0, 10);

function Bi({ fr, ru }: { fr: string; ru: string }) {
  return (
    <span className="inline-block leading-tight align-middle">
      <span className="block">{fr}</span>
      <span className="block text-[0.6rem] font-medium opacity-60">{ru}</span>
    </span>
  );
}

const STATUS_BADGE: Record<ChargeStatus, string> = {
  paid: "badge badge-success",
  partial: "badge badge-warning",
  late: "badge badge-error",
  unpaid: "badge badge-neutral",
  lost: "badge badge-neutral line-through",
};

function Kpi({ label, ru, value, tone }: { label: string; ru: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
        <Bi fr={label} ru={ru} />
      </div>
      <div
        className={`mt-1 text-2xl font-extrabold tabular-nums ${
          tone === "bad" ? "text-error-600" : tone === "good" ? "text-emerald-700" : "text-stone-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function LocationView({ supabase }: { supabase: Supabase }) {
  const [tab, setTab] = useState<Tab>("loyers");
  const [loading, setLoading] = useState(true);
  const [props, setProps] = useState<VProperty[]>([]);
  const [tenants, setTenants] = useState<VTenant[]>([]);
  const [leases, setLeases] = useState<VLease[]>([]);
  const [charges, setCharges] = useState<VCharge[]>([]);
  const [txs, setTxs] = useState<VBankTx[]>([]);
  const [missingTables, setMissingTables] = useState(false);

  const load = useCallback(async () => {
    const [p, t, l, c, b] = await Promise.all([
      supabase.from("voldis_properties").select("*").order("lot_number"),
      supabase.from("voldis_tenants").select("*").order("name"),
      supabase.from("voldis_leases").select("*").order("start_date", { ascending: false }),
      supabase.from("voldis_charges").select("*").order("due_date", { ascending: false }).limit(5000),
      supabase.from("voldis_bank_transactions").select("*").order("settled_at", { ascending: false }).limit(1000),
    ]);
    if (p.error) {
      setMissingTables(true);
      setLoading(false);
      return;
    }
    setProps(((p.data ?? []) as VProperty[]).sort((a, b2) => Number(a.lot_number) - Number(b2.lot_number)));
    setTenants((t.data ?? []) as VTenant[]);
    setLeases((l.data ?? []) as VLease[]);
    setCharges((c.data ?? []) as VCharge[]);
    setTxs((b.data ?? []) as VBankTx[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const tenantName = useMemo(() => new Map(tenants.map((t) => [t.id, t.name])), [tenants]);
  const lotOf = useMemo(() => new Map(props.map((p) => [p.id, p.lot_number])), [props]);

  const activeLeases = leases.filter((l) => l.is_active);
  const monthRentTotal = round2(activeLeases.reduce((s, l) => s + num(l.monthly_total), 0));
  const unpaidTotal = round2(
    charges.filter((c) => c.kind === "rent" && c.status !== "paid" && c.status !== "lost").reduce((s, c) => s + remaining(c), 0)
  );
  const thisMonth = todayIso().slice(0, 7);
  const cashedThisMonth = round2(
    charges.filter((c) => c.paid_on && c.paid_on.slice(0, 7) === thisMonth).reduce((s, c) => s + num(c.amount_paid), 0)
  );

  if (missingTables) {
    return (
      <div className="card">
        <p className="font-bold text-stone-800">VOLDIS — Аренда локалей</p>
        <p className="mt-2 text-sm text-stone-600">
          Таблицы ещё не созданы. Нужно выполнить миграцию <code>0115_voldis_location.sql</code> в Supabase SQL editor.
        </p>
      </div>
    );
  }

  const tabs: { key: Tab; fr: string; ru: string }[] = [
    { key: "loyers", fr: "Loyers", ru: "Платежи" },
    { key: "biens", fr: "Lots", ru: "Помещения" },
    { key: "locataires", fr: "Locataires", ru: "Арендаторы" },
    { key: "baux", fr: "Baux", ru: "Договоры" },
    { key: "banque", fr: "Banque", ru: "Банк" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Lots loués"
          ru="Сдано помещений"
          value={`${new Set(activeLeases.map((l) => l.property_id)).size} / ${props.length}`}
        />
        <Kpi label="Loyers par mois" ru="Аренда в месяц" value={eur(monthRentTotal)} />
        <Kpi label="Impayés" ru="Задолженность" value={eur(unpaidTotal)} tone={unpaidTotal > 0 ? "bad" : "good"} />
        <Kpi label="Encaissé ce mois" ru="Получено в этом месяце" value={eur(cashedThisMonth)} tone="good" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-primary-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            <Bi fr={t.fr} ru={t.ru} />
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card text-sm text-stone-500">Chargement… / Загрузка…</div>
      ) : (
        <>
          {tab === "loyers" && (
            <LoyersTab
              supabase={supabase}
              charges={charges}
              leases={leases}
              tenantName={tenantName}
              lotOf={lotOf}
              onChanged={load}
            />
          )}
          {tab === "biens" && <BiensTab props={props} leases={leases} tenantName={tenantName} />}
          {tab === "locataires" && <LocatairesTab tenants={tenants} charges={charges} leases={leases} lotOf={lotOf} />}
          {tab === "baux" && <BauxTab leases={leases} tenantName={tenantName} lotOf={lotOf} />}
          {tab === "banque" && (
            <BanqueTab
              supabase={supabase}
              txs={txs}
              charges={charges}
              tenants={tenants}
              tenantName={tenantName}
              onChanged={load}
            />
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────── Loyers ─────────────────────────

function LoyersTab({
  supabase,
  charges,
  leases,
  tenantName,
  lotOf,
  onChanged,
}: {
  supabase: Supabase;
  charges: VCharge[];
  leases: VLease[];
  tenantName: Map<string, string>;
  lotOf: Map<string, string>;
  onChanged: () => Promise<void>;
}) {
  const current = todayIso().slice(0, 7);
  const months = useMemo(() => {
    const set = new Set(charges.map((c) => c.due_date.slice(0, 7)));
    set.add(current);
    return Array.from(set).sort().reverse();
  }, [charges, current]);
  const [month, setMonth] = useState(current);
  const [statusFilter, setStatusFilter] = useState<"all" | "open">("all");
  const [busy, setBusy] = useState(false);

  const rows = charges
    .filter((c) => c.due_date.slice(0, 7) === month)
    .filter((c) => (statusFilter === "open" ? c.status !== "paid" && c.status !== "lost" : true))
    .sort((a, b) => Number(lotOf.get(a.property_id ?? "") ?? 0) - Number(lotOf.get(b.property_id ?? "") ?? 0));
  const totalDue = round2(rows.reduce((s, c) => s + num(c.amount_due), 0));
  const totalPaid = round2(rows.reduce((s, c) => s + Math.min(num(c.amount_paid), num(c.amount_due)), 0));

  async function setPaid(c: VCharge, amount: number) {
    setBusy(true);
    const next = { ...c, amount_paid: amount, paid_on: amount > 0 ? c.paid_on ?? todayIso() : null };
    const { error } = await supabase
      .from("voldis_charges")
      .update({ amount_paid: amount, paid_on: next.paid_on, status: statusFor(next) })
      .eq("id", c.id);
    setBusy(false);
    if (error) toast.error("Erreur : " + error.message);
    else await onChanged();
  }

  async function partial(c: VCharge) {
    const raw = window.prompt(`Montant encaissé pour ${tenantName.get(c.tenant_id ?? "") ?? ""} (total dû ${eur(num(c.amount_due))}) :`, String(num(c.amount_paid)));
    if (raw === null) return;
    const amount = Number(raw.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Montant invalide / Неверная сумма");
    await setPaid(c, amount);
  }

  async function markLost(c: VCharge) {
    if (!window.confirm("Marquer cette échéance comme perdue ? / Отметить как безвозвратно потерянную?")) return;
    await supabase.from("voldis_charges").update({ status: "lost" }).eq("id", c.id);
    await onChanged();
  }

  async function generate() {
    const [y, m] = month.split("-").map(Number);
    const first = `${month}-01`;
    const last = monthEnd(y, m);
    const have = new Set(charges.filter((c) => c.kind === "rent" && c.lease_id && c.due_date.slice(0, 7) === month).map((c) => c.lease_id!));
    const todo = leases.filter(
      (l) => l.is_active && l.start_date <= last && (!l.end_date || l.end_date >= first) && !have.has(l.id)
    );
    if (todo.length === 0) return toast.success("Tout est déjà généré / Всё уже создано");
    if (!window.confirm(`Créer ${todo.length} loyer(s) pour ${month} ?\n/ Создать ${todo.length} платеж(ей) за ${month}?`)) return;
    setBusy(true);
    const { error } = await supabase.from("voldis_charges").insert(
      todo.map((l) => ({
        lease_id: l.id,
        property_id: l.property_id,
        tenant_id: l.tenant_id,
        kind: "rent",
        due_date: `${month}-${String(l.billing_day).padStart(2, "0")}`,
        period_start: first,
        period_end: last,
        amount_due: l.monthly_total,
        vat_amount: num(l.vat),
        amount_paid: 0,
        status: "unpaid",
        description: `Loyer ${frDate(first)} - ${frDate(last)}`,
      }))
    );
    setBusy(false);
    if (error) toast.error("Erreur : " + error.message);
    else {
      toast.success(`${todo.length} loyer(s) créé(s)`);
      await onChanged();
    }
  }

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {m.split("-").reverse().join("/")}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "open")}>
          <option value="all">Tous / Все</option>
          <option value="open">Impayés / Неоплаченные</option>
        </select>
        <button className="btn btn-secondary ml-auto" disabled={busy} onClick={() => void generate()}>
          <Bi fr="Générer les loyers du mois" ru="Создать аренду за месяц" />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Locataire</th>
              <th>Échéance</th>
              <th className="text-right">Dû</th>
              <th className="text-right">Encaissé</th>
              <th>État</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="font-bold">{lotOf.get(c.property_id ?? "") ?? "—"}</td>
                <td>{tenantName.get(c.tenant_id ?? "") ?? "—"}</td>
                <td className="whitespace-nowrap text-stone-500">{frDate(c.due_date)}</td>
                <td className="text-right tabular-nums">{eur(num(c.amount_due))}</td>
                <td className="text-right tabular-nums">
                  {eur(num(c.amount_paid))}
                  {c.paid_on && <div className="text-[10px] text-stone-400">{frDate(c.paid_on)}</div>}
                </td>
                <td>
                  <span className={STATUS_BADGE[c.status]}>
                    <Bi fr={STATUS_LABEL[c.status].fr} ru={STATUS_LABEL[c.status].ru} />
                  </span>
                </td>
                <td className="whitespace-nowrap text-right">
                  {c.status !== "paid" && c.status !== "lost" && (
                    <>
                      <button className="btn btn-secondary px-2 py-1 text-xs" disabled={busy} onClick={() => void setPaid(c, num(c.amount_due))}>
                        <Bi fr="Encaissé" ru="Оплачено" />
                      </button>{" "}
                      <button className="btn btn-secondary px-2 py-1 text-xs" disabled={busy} onClick={() => void partial(c)}>
                        <Bi fr="Partiel" ru="Частично" />
                      </button>{" "}
                      <button className="btn btn-secondary px-2 py-1 text-xs" disabled={busy} onClick={() => void markLost(c)}>
                        <Bi fr="Perdu" ru="Потеряно" />
                      </button>
                    </>
                  )}
                  {c.status === "paid" && (
                    <button className="btn btn-secondary px-2 py-1 text-xs" disabled={busy} onClick={() => void setPaid(c, 0)}>
                      <Bi fr="Annuler" ru="Отменить" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-stone-400">
                  Aucune échéance ce mois-ci / Нет платежей за этот месяц
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-bold">
                <td colSpan={3}>Total</td>
                <td className="text-right tabular-nums">{eur(totalDue)}</td>
                <td className="text-right tabular-nums">{eur(totalPaid)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── Lots ─────────────────────────

function BiensTab({ props, leases, tenantName }: { props: VProperty[]; leases: VLease[]; tenantName: Map<string, string> }) {
  const leaseByProp = new Map(leases.filter((l) => l.is_active).map((l) => [l.property_id, l]));
  const totalSurface = props.reduce((s, p) => s + num(p.surface_m2), 0);
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Type</th>
            <th className="text-right">m²</th>
            <th>Locataire</th>
            <th className="text-right">Loyer / mois</th>
            <th className="text-right">Valeur locative</th>
            <th>État</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p) => {
            const l = leaseByProp.get(p.id);
            return (
              <tr key={p.id}>
                <td className="font-bold">{p.lot_number}</td>
                <td>{p.kind}</td>
                <td className="text-right tabular-nums">{num(p.surface_m2)}</td>
                <td>{l ? tenantName.get(l.tenant_id) : <span className="text-stone-400">—</span>}</td>
                <td className="text-right tabular-nums">{l ? eur(num(l.monthly_total)) : "—"}</td>
                <td className="text-right tabular-nums text-stone-500">{p.list_rent != null ? eur(num(p.list_rent)) : "—"}</td>
                <td>
                  <span className={`badge ${l ? "badge-success" : "badge-neutral"}`}>
                    <Bi
                      fr={PROPERTY_STATUS_LABEL[l ? "rented" : p.status === "rented" ? "available" : p.status].fr}
                      ru={PROPERTY_STATUS_LABEL[l ? "rented" : p.status === "rented" ? "available" : p.status].ru}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={2}>Total</td>
            <td className="text-right tabular-nums">{totalSurface}</td>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ───────────────────────── Locataires ─────────────────────────

function LocatairesTab({
  tenants,
  charges,
  leases,
  lotOf,
}: {
  tenants: VTenant[];
  charges: VCharge[];
  leases: VLease[];
  lotOf: Map<string, string>;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const balance = (id: string) =>
    round2(charges.filter((c) => c.tenant_id === id && c.status !== "lost" && c.kind === "rent").reduce((s, c) => s + remaining(c), 0));
  const rows = tenants.filter((t) => showArchived || t.is_active);
  return (
    <div className="card overflow-x-auto">
      <label className="mb-3 flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Afficher les archivés / Показать архивных
      </label>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Locataire</th>
            <th>Lot</th>
            <th>SIREN</th>
            <th>Contact</th>
            <th className="text-right">Reste dû</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const lots = leases.filter((l) => l.tenant_id === t.id && l.is_active).map((l) => lotOf.get(l.property_id));
            const due = balance(t.id);
            return (
              <tr key={t.id} className={t.is_active ? "" : "opacity-60"}>
                <td className="font-bold">{t.name}</td>
                <td>{lots.length ? lots.join(", ") : <span className="text-stone-400">—</span>}</td>
                <td className="tabular-nums text-stone-500">{t.siren ?? "—"}</td>
                <td className="text-xs text-stone-500">
                  {t.email && <div>{t.email}</div>}
                  {t.phone && <div>{t.phone}</div>}
                </td>
                <td className={`text-right tabular-nums ${due > 0 ? "font-bold text-error-600" : "text-stone-400"}`}>{due > 0 ? eur(due) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── Baux ─────────────────────────

function BauxTab({ leases, tenantName, lotOf }: { leases: VLease[]; tenantName: Map<string, string>; lotOf: Map<string, string> }) {
  const today = todayIso();
  const [in90] = useState(() => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const rows = leases.filter((l) => l.is_active).sort((a, b) => (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999"));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Locataire</th>
            <th>Début</th>
            <th>Fin</th>
            <th className="text-right">HT</th>
            <th className="text-right">TVA</th>
            <th className="text-right">Charges</th>
            <th className="text-right">Total / mois</th>
            <th className="text-right">Dépôt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const ending = l.end_date && l.end_date <= in90;
            return (
              <tr key={l.id}>
                <td className="font-bold">{lotOf.get(l.property_id)}</td>
                <td>{tenantName.get(l.tenant_id)}</td>
                <td className="whitespace-nowrap text-stone-500">{frDate(l.start_date)}</td>
                <td className="whitespace-nowrap">
                  {frDate(l.end_date)}
                  {ending && (
                    <span className={`badge ml-2 ${l.end_date! < today ? "badge-error" : "badge-warning"}`}>
                      {l.end_date! < today ? "Expiré" : "< 90 j."}
                    </span>
                  )}
                </td>
                <td className="text-right tabular-nums">{l.rent_ht != null ? eur(num(l.rent_ht)) : "—"}</td>
                <td className="text-right tabular-nums">{l.vat != null ? eur(num(l.vat)) : "—"}</td>
                <td className="text-right tabular-nums">{l.charges != null ? eur(num(l.charges)) : "—"}</td>
                <td className="text-right font-bold tabular-nums">{eur(num(l.monthly_total))}</td>
                <td className="text-right tabular-nums text-stone-500">{eur(num(l.deposit))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── Banque (Crédit Agricole) ─────────────────────────

function BanqueTab({
  supabase,
  txs,
  charges,
  tenants,
  tenantName,
  onChanged,
}: {
  supabase: Supabase;
  txs: VBankTx[];
  charges: VCharge[];
  tenants: VTenant[];
  tenantName: Map<string, string>;
  onChanged: () => Promise<void>;
}) {
  const [importing, setImporting] = useState(false);
  const [pw, setPw] = useState<{
    configured: boolean;
    connected: boolean;
    lastSync?: string | null;
    connections?: { id: number; state: string | null; bank: string | null }[];
    error?: string;
  } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "credit" | "debit" | "todo">("all");

  useEffect(() => {
    fetch("/api/voldis/powens/status")
      .then((r) => r.json())
      .then((j) => setPw(j))
      .catch(() => setPw({ configured: false, connected: false }));
    const q = new URLSearchParams(window.location.search).get("voldis_bank");
    if (q) {
      if (q === "ok") toast.success("Crédit Agricole connecté / Crédit Agricole подключён");
      else toast.error("Connexion bancaire échouée / Не удалось подключить банк");
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
      toast.error(e instanceof Error ? e.message : "Erreur Powens");
      setPwBusy(false);
    }
  }

  async function powensSync() {
    setPwBusy(true);
    try {
      const res = await fetch("/api/voldis/powens/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast.success(`Banque : ${j.added} nouvelle(s) opération(s) / новых операций: ${j.added}`);
      await onChanged();
      setPw((p) => (p ? { ...p, lastSync: new Date().toISOString() } : p));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur Powens");
    } finally {
      setPwBusy(false);
    }
  }

  const needsReconnect = !!pw?.connections?.some((c) => c.state);
  const suggestions = useMemo(() => suggestMatches(txs, charges, tenants), [txs, charges, tenants]);
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
      if (parsed.length === 0) throw new Error("Aucune opération reconnue dans ce fichier / В файле нет операций");
      const known = new Set(txs.map((t) => t.external_id));
      const rows = toRows(parsed, "import").map((r) => ({ ...r, bank_account: account?.bank_account ?? null, iban: account?.iban ?? null }));
      const fresh = rows.filter((r) => !known.has(r.external_id));
      if (fresh.length > 0) {
        const { error } = await supabase.from("voldis_bank_transactions").upsert(fresh, { onConflict: "external_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      toast.success(`${fresh.length} nouvelle(s) opération(s), ${rows.length - fresh.length} déjà connue(s) / новых: ${fresh.length}, уже были: ${rows.length - fresh.length}`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'import");
    } finally {
      setImporting(false);
    }
  }

  async function reconcile(tx: VBankTx, charge: VCharge) {
    const paid = round2(num(charge.amount_paid) + num(tx.amount));
    const paidOn = (tx.settled_at ?? todayIso()).slice(0, 10);
    const next = { ...charge, amount_paid: paid, paid_on: paidOn };
    const { error } = await supabase
      .from("voldis_charges")
      .update({ amount_paid: paid, paid_on: paidOn, status: statusFor(next) })
      .eq("id", charge.id);
    if (error) return toast.error("Erreur : " + error.message);
    const { error: e2 } = await supabase.from("voldis_bank_transactions").update({ charge_id: charge.id }).eq("id", tx.id);
    if (e2) return toast.error("Erreur : " + e2.message);
    toast.success("Rapproché / Сопоставлено");
    await onChanged();
  }

  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const shown = txs.filter((t) => (filter === "all" ? true : filter === "todo" ? t.side === "credit" && !t.charge_id : t.side === filter));

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="font-bold text-stone-800">{account?.bank_account ?? "Crédit Agricole"}</p>
            <p className="text-xs text-stone-500">
              {account?.iban ?? "Importez un relevé pour commencer"} · {txs.length} opérations
            </p>
          </div>
          <label className={`btn btn-primary ml-auto cursor-pointer ${importing ? "opacity-60" : ""}`}>
            <Bi fr={importing ? "Import…" : "Importer un relevé"} ru={importing ? "Импорт…" : "Загрузить выписку"} />
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
              <Bi fr="Synchronisation automatique" ru="Автоматическая синхронизация" />
            </p>
            <p className="text-xs text-stone-500">
              {pw === null
                ? "Vérification…"
                : !pw.configured
                ? "Powens n'est pas encore configuré sur le serveur / Powens ещё не настроен на сервере"
                : !pw.connected
                ? "Aucune banque liée / Банк не подключён"
                : needsReconnect
                ? "Reconnexion à la banque nécessaire / Нужно заново подтвердить доступ к банку"
                : `Connecté · chaque jour à 7 h · dernière synchro : ${pw.lastSync ? frDate(pw.lastSync) : "—"}`}
              {pw?.error && <span className="ml-1 text-error-600">· {pw.error}</span>}
            </p>
          </div>
          {pw?.configured && (!pw.connected || needsReconnect) && (
            <button className="btn btn-dark" disabled={pwBusy} onClick={() => void powensConnect()}>
              <Bi fr={pw.connected ? "Reconnecter" : "Connecter Crédit Agricole"} ru={pw.connected ? "Переподключить" : "Подключить Crédit Agricole"} />
            </button>
          )}
          {pw?.configured && pw.connected && (
            <button className="btn btn-secondary" disabled={pwBusy} onClick={() => void powensSync()}>
              <Bi fr="Synchroniser maintenant" ru="Синхронизировать сейчас" />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Crédit Agricole → Ma Banque en ligne → Télécharger les opérations (OFX, QIF ou CSV). Les opérations déjà importées sont ignorées. /
          Скачайте выписку в онлайн-банке (OFX, QIF или CSV) — уже загруженные операции пропускаются.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 px-3 py-2">
            <div className="text-[11px] font-bold uppercase text-emerald-800">
              <Bi fr="Encaissements" ru="Поступления" />
            </div>
            <div className="text-lg font-extrabold tabular-nums text-emerald-800">{eur(income)}</div>
          </div>
          <div className="rounded-xl bg-stone-100 px-3 py-2">
            <div className="text-[11px] font-bold uppercase text-stone-600">
              <Bi fr="Dépenses" ru="Расходы" />
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

      {suggestions.length > 0 && (
        <div className="card">
          <p className="mb-2 font-bold text-stone-800">
            <Bi fr="Rapprochements proposés" ru="Предлагаемые сопоставления" />
          </p>
          <ul className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <li key={s.tx.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-sm">
                <span className="tabular-nums font-bold text-emerald-800">{eur(num(s.tx.amount))}</span>
                <span className="text-stone-500">{frDate(s.tx.settled_at)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {s.tx.label} → <strong>{s.tenantName}</strong>, loyer {frDate(s.charge.due_date)} (reste {eur(remaining(s.charge))})
                  {!s.exact && <span className="ml-1 text-amber-700">· montant différent</span>}
                </span>
                <button className="btn btn-dark px-3 py-1 text-xs" onClick={() => void reconcile(s.tx, s.charge)}>
                  <Bi fr="Rapprocher" ru="Сопоставить" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Toutes", "Все"],
              ["credit", "Encaissements", "Поступления"],
              ["debit", "Dépenses", "Расходы"],
              ["todo", "À rapprocher", "Не сопоставлены"],
            ] as const
          ).map(([k, fr, ru]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
            >
              <Bi fr={fr} ru={ru} />
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th className="text-right">Montant</th>
              <th>Rapproché / catégorie</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const c = t.charge_id ? chargeById.get(t.charge_id) : null;
              return (
                <tr key={t.id}>
                  <td className="whitespace-nowrap text-stone-500">{frDate(t.settled_at)}</td>
                  <td className="max-w-md truncate" title={t.label ?? ""}>
                    {t.label ?? t.reference ?? "—"}
                  </td>
                  <td className={`text-right tabular-nums font-bold ${t.side === "credit" ? "text-emerald-700" : "text-stone-600"}`}>
                    {t.side === "credit" ? "+" : "−"}
                    {eur(num(t.amount))}
                  </td>
                  <td className="text-xs text-stone-500">
                    {c ? `${tenantName.get(c.tenant_id ?? "") ?? ""} · ${frDate(c.due_date)}` : t.category ?? (t.side === "credit" ? "—" : "")}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-stone-400">
                  Aucune opération / Нет операций
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
