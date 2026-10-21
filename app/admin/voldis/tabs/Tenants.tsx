"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import { num, remaining, round2, type VTenant } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { DocumentsPanel, LeaseModal, TenantModal } from "../forms";
import { Bi, Empty, Modal, Status, eur, frDate } from "../ui";
import { callApi, openPdf } from "./Rents";

export function useTenantBalance(data: VoldisData) {
  return (id: string) =>
    round2(data.charges.filter((c) => c.tenant_id === id && c.kind === "rent" && c.status !== "paid" && c.status !== "lost").reduce((s, c) => s + remaining(c), 0));
}

export default function Tenants({ supabase, data }: { supabase: Supabase; data: VoldisData }) {
  const { tenants, leases, props, reload } = data;
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<VTenant | null | "new">(null);
  const [detail, setDetail] = useState<string | null>(null);
  const balance = useTenantBalance(data);
  const lotOf = new Map(props.map((p) => [p.id, p.lot_number]));
  const rows = tenants.filter((t) => showArchived || t.is_active);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-500">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Afficher les archivés
        </label>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Bi fr="+ Locataire" ru="+ Арендатор" />
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3">Locataire</th>
              <th className="px-4 py-3">Lot</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3 text-right">Reste dû</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((t) => {
              const lots = leases.filter((l) => l.tenant_id === t.id && l.is_active).map((l) => lotOf.get(l.property_id));
              const due = balance(t.id);
              return (
                <tr key={t.id} className={`cursor-pointer hover:bg-stone-50/60 ${t.is_active ? "" : "opacity-50"}`} onClick={() => setDetail(t.id)}>
                  <td className="px-4 py-3 font-semibold text-stone-800">{t.name}</td>
                  <td className="px-4 py-3 text-stone-600">{lots.length ? lots.join(", ") : <span className="text-stone-300">—</span>}</td>
                  <td className="px-4 py-3 text-xs text-stone-500">
                    {t.email ?? <span className="text-amber-600">pas d&apos;e-mail</span>}
                    {t.phone && <div>{t.phone}</div>}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${due > 0 ? "font-bold text-red-600" : "text-stone-300"}`}>{due > 0 ? eur(due) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>Aucun locataire.</Empty>}
      </div>
      {editing && <TenantModal supabase={supabase} tenant={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
      {detail && <TenantDetail supabase={supabase} data={data} tenantId={detail} onClose={() => setDetail(null)} onEdit={(t) => { setDetail(null); setEditing(t); }} />}
    </div>
  );
}

function TenantDetail({ supabase, data, tenantId, onClose, onEdit }: { supabase: Supabase; data: VoldisData; tenantId: string; onClose: () => void; onEdit: (t: VTenant) => void }) {
  const { tenants, leases, props, docs, invoices, charges, reload } = data;
  const t = tenants.find((x) => x.id === tenantId);
  const [newLease, setNewLease] = useState(false);
  const [openLease, setOpenLease] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const balance = useTenantBalance(data);
  if (!t) return null;
  const mine = leases.filter((l) => l.tenant_id === t.id);
  const lotOf = new Map(props.map((p) => [p.id, p.lot_number]));
  const myInvoices = invoices.filter((i) => i.tenant_id === t.id && i.status !== "void").slice(0, 8);
  const due = balance(t.id);
  const lastPaid = charges.filter((c) => c.tenant_id === t.id && c.paid_on).sort((a, b) => (b.paid_on ?? "").localeCompare(a.paid_on ?? ""))[0];

  async function remind() {
    if (!window.confirm(`Envoyer un rappel de ${eur(due)} à ${t!.name} ?\nОтправить напоминание о долге ${eur(due)}?`)) return;
    setBusy(true);
    const { ok, data: r } = await callApi<{ to: string }>("/api/voldis/reminders", { tenantId: t!.id });
    setBusy(false);
    if (!ok) return toast.error(r.error ?? "Erreur");
    toast.success(`Rappel envoyé à ${r.to} / Напоминание отправлено`);
    await reload();
  }

  return (
    <>
      <Modal open onClose={onClose} title={t.name} width="max-w-2xl">
        <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <Info label="E-mail" value={t.billing_email ? `${t.email ?? "—"} · factures : ${t.billing_email}` : t.email} />
          <Info label="Téléphone" value={t.phone} />
          <Info label="SIREN" value={t.siren} />
          <Info label="TVA" value={t.vat_number} />
          <Info label="Représentant" value={t.representative} />
          <Info label="Adresse" value={t.address} />
        </div>
        {t.notes && <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">{t.notes}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-stone-50 px-4 py-3">
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">Reste dû</div>
            <div className={`text-xl font-extrabold tabular-nums ${due > 0 ? "text-red-600" : "text-emerald-700"}`}>{due > 0 ? eur(due) : "À jour"}</div>
            {lastPaid && <div className="text-xs text-stone-400">Dernier paiement : {frDate(lastPaid.paid_on)}</div>}
          </div>
          {due > 0 && (
            <button className="btn btn-secondary" disabled={busy} onClick={() => void remind()}>
              <Bi fr="Envoyer un rappel" ru="Напомнить об оплате" />
            </button>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-stone-700"><Bi fr="Baux" ru="Договоры" /></p>
            <button className="text-sm font-semibold text-primary-700 hover:underline" onClick={() => setNewLease(true)}>
              + Nouveau bail
            </button>
          </div>
          {mine.length === 0 ? (
            <p className="text-sm text-stone-400">Aucun bail</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {mine.map((l) => (
                <li key={l.id} className="flex cursor-pointer items-center gap-3 py-2 text-sm hover:bg-stone-50" onClick={() => setOpenLease(l.id)}>
                  <span className="w-14 font-bold">Lot {lotOf.get(l.property_id)}</span>
                  <span className="flex-1 text-stone-500">{frDate(l.start_date)} → {frDate(l.end_date)}</span>
                  <span className="tabular-nums">{eur(num(l.monthly_total))}/mois</span>
                  {!l.is_active && <Status tone="idle">terminé</Status>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {myInvoices.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-bold text-stone-700"><Bi fr="Dernières factures" ru="Последние счета" /></p>
            <ul className="divide-y divide-stone-100">
              {myInvoices.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                  <button className="font-semibold hover:underline" onClick={() => openPdf(i.id)}>{i.number}</button>
                  <span className="flex-1 text-stone-400">{frDate(i.issue_date)}</span>
                  <span className="tabular-nums">{eur(num(i.total_ttc))}</span>
                  {i.sent_at ? <Status tone="good">envoyée</Status> : <Status tone="idle">non envoyée</Status>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 border-t border-stone-100 pt-5">
          <DocumentsPanel supabase={supabase} docs={docs} tenantId={t.id} defaultKind="identity" onChanged={() => void reload()} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={() => onEdit(t)}>
            <Bi fr="Modifier la fiche" ru="Изменить данные" />
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            <Bi fr="Fermer" ru="Закрыть" />
          </button>
        </div>
      </Modal>
      {newLease && <LeaseModal supabase={supabase} lease={null} props={props} tenants={tenants} leases={leases} docs={docs} defaultTenantId={t.id} onClose={() => setNewLease(false)} onSaved={() => void reload()} />}
      {openLease && <LeaseModal supabase={supabase} lease={leases.find((l) => l.id === openLease) ?? null} props={props} tenants={tenants} leases={leases} docs={docs} onClose={() => setOpenLease(null)} onSaved={() => void reload()} />}
    </>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2 py-1">
      <span className="w-28 shrink-0 text-stone-400">{label}</span>
      <span className="min-w-0 break-words text-stone-800">{value || <span className="text-stone-300">—</span>}</span>
    </div>
  );
}
