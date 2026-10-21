"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import { num, round2, type VLease } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { LeaseModal } from "../forms";
import { Bi, Empty, Field, Menu, Modal, Status, eur, frDate, todayIso } from "../ui";

export default function Leases({ supabase, data }: { supabase: Supabase; data: VoldisData }) {
  const { leases, tenants, props, docs, reload } = data;
  const [editing, setEditing] = useState<VLease | null | "new">(null);
  const [revising, setRevising] = useState<VLease | null>(null);
  const [showEnded, setShowEnded] = useState(false);
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const lotOf = new Map(props.map((p) => [p.id, p.lot_number]));
  const hasContract = new Set(docs.filter((d) => d.kind === "contract" && d.lease_id).map((d) => d.lease_id));
  const [in90] = useState(() => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const today = todayIso();
  const rows = leases
    .filter((l) => showEnded || l.is_active)
    .sort((a, b) => (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999"));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-500">
          <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
          Afficher les baux terminés
        </label>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Bi fr="+ Bail" ru="+ Договор" />
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3">Lot</th>
              <th className="px-4 py-3">Locataire</th>
              <th className="px-4 py-3">Période</th>
              <th className="px-4 py-3 text-right">Par mois</th>
              <th className="px-4 py-3 text-right">Dépôt</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((l) => {
              const ending = l.is_active && l.end_date && l.end_date <= in90;
              return (
                <tr key={l.id} className={`cursor-pointer hover:bg-stone-50/60 ${l.is_active ? "" : "opacity-50"}`} onClick={() => setEditing(l)}>
                  <td className="px-4 py-3 font-bold text-stone-800">{lotOf.get(l.property_id)}</td>
                  <td className="px-4 py-3 font-medium">
                    {tenantName.get(l.tenant_id)}
                    {l.is_active && !hasContract.has(l.id) && <div className="text-xs font-normal text-amber-600">contrat non ajouté</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                    {frDate(l.start_date)} → {frDate(l.end_date)}
                    {ending && <div><Status tone={l.end_date! < today ? "bad" : "warn"}>{l.end_date! < today ? "expiré" : "bientôt terminé"}</Status></div>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{eur(num(l.monthly_total))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-400">{eur(num(l.deposit))}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {l.is_active && <Menu items={[{ label: "Réviser le loyer…", onClick: () => setRevising(l) }]} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>Aucun bail.</Empty>}
      </div>
      {editing && (
        <LeaseModal supabase={supabase} lease={editing === "new" ? null : editing} props={props} tenants={tenants} leases={leases} docs={docs} onClose={() => setEditing(null)} onSaved={() => void reload()} />
      )}
      {revising && <ReviseModal supabase={supabase} lease={revising} tenantName={tenantName.get(revising.tenant_id) ?? ""} onClose={() => setRevising(null)} onSaved={() => void reload()} />}
    </div>
  );
}

export function ReviseModal({ supabase, lease, tenantName, onClose, onSaved }: { supabase: Supabase; lease: VLease; tenantName: string; onClose: () => void; onSaved: () => void }) {
  const detailed = lease.rent_ht != null;
  const [value, setValue] = useState(String(detailed ? lease.rent_ht : lease.monthly_total));
  const [when, setWhen] = useState(lease.next_revision_date ?? todayIso());
  const [future, setFuture] = useState(true);
  const [busy, setBusy] = useState(false);

  const newValue = Number(value.replace(",", "."));
  const rate = detailed && num(lease.rent_ht) > 0 ? num(lease.vat) / num(lease.rent_ht) : 0;
  const vat = detailed ? round2(newValue * rate) : null;
  const charges = detailed ? num(lease.charges) : null;
  const total = detailed ? round2(newValue + (vat ?? 0) + (charges ?? 0)) : round2(newValue);
  const before = num(lease.monthly_total);

  async function apply() {
    if (!Number.isFinite(newValue) || newValue <= 0) return toast.error("Montant invalide / Неверная сумма");
    setBusy(true);
    const nextYear = `${Number(when.slice(0, 4)) + 1}${when.slice(4)}`;
    const { error } = await supabase
      .from("voldis_leases")
      .update({ rent_ht: detailed ? newValue : null, vat, monthly_total: total, next_revision_date: nextYear })
      .eq("id", lease.id);
    if (error) {
      setBusy(false);
      return toast.error("Erreur : " + error.message);
    }
    if (future) {
      await supabase
        .from("voldis_charges")
        .update({ amount_due: total, vat_amount: vat ?? 0 })
        .eq("lease_id", lease.id)
        .eq("kind", "rent")
        .eq("amount_paid", 0)
        .neq("status", "lost")
        .gte("due_date", when);
    }
    setBusy(false);
    toast.success("Loyer révisé / Аренда пересмотрена");
    onSaved();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Réviser le loyer · ${tenantName}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={detailed ? "Nouveau loyer HT (€)" : "Nouveau montant mensuel (€)"} ru="Новая аренда">
          <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
        <Field label="À partir du" ru="Начиная с">
          <input className="input" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
      <p className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
        Total par mois : <strong className="text-stone-900">{eur(before)}</strong> → <strong className="text-stone-900">{eur(total)}</strong>
        {total !== before && <span className="ml-2 text-stone-400">({total > before ? "+" : ""}{eur(total - before)})</span>}
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} />
        Appliquer aux échéances à venir non encaissées (à partir de {frDate(when)})
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose}>
          <Bi fr="Annuler" ru="Отмена" />
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void apply()}>
          <Bi fr="Appliquer" ru="Применить" />
        </button>
      </div>
    </Modal>
  );
}
