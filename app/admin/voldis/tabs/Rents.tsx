"use client";

import { useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { STATUS_LABEL, monthEnd, num, remaining, round2, statusFor, type VCharge, type VInvoice } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { ChargeModal } from "../forms";
import { Bi, Empty, Menu, Status, eur, frDate, todayIso } from "../ui";

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

const tone = (s: VCharge["status"]) => ({ paid: "good", partial: "warn", late: "bad", unpaid: "idle", lost: "idle" }[s] as "good" | "warn" | "bad" | "idle");

export async function callApi<T = unknown>(url: string, body?: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function openPdf(invoiceId: string) {
  window.open(`/api/voldis/invoices/${invoiceId}/pdf`, "_blank", "noopener");
}

/** Crée (ou récupère) la facture / quittance d'une échéance. */
export async function ensureInvoice(chargeId: string, kind: "invoice" | "receipt"): Promise<VInvoice | null> {
  const { ok, data } = await callApi<{ invoice: VInvoice }>("/api/voldis/invoices", { chargeId, kind });
  if (!ok) {
    toast.error(data.error ?? "Erreur");
    return null;
  }
  return data.invoice;
}

export async function sendInvoice(inv: VInvoice, tenantEmail: string | null): Promise<boolean> {
  const { ok, data } = await callApi<{ to: string }>(`/api/voldis/invoices/${inv.id}/send`);
  if (!ok) {
    toast.error(data.error ?? "Erreur d'envoi");
    return false;
  }
  toast.success(`Envoyé à ${data.to ?? tenantEmail} / Отправлено`);
  return true;
}

export default function Rents({ supabase, data, initialMonth }: { supabase: Supabase; data: VoldisData; initialMonth?: string }) {
  const { charges, leases, tenants, props, invoices, reload } = data;
  const [month, setMonth] = useState(initialMonth ?? todayIso().slice(0, 7));
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const tenantName = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);
  const lotOf = useMemo(() => new Map(props.map((p) => [p.id, p.lot_number])), [props]);
  const invoiceBy = useMemo(() => {
    const m = new Map<string, VInvoice>();
    invoices.filter((i) => i.status !== "void" && i.charge_id).forEach((i) => m.set(`${i.charge_id}|${i.kind}`, i));
    return m;
  }, [invoices]);

  const rows = charges
    .filter((c) => c.due_date.slice(0, 7) === month)
    .filter((c) => (onlyOpen ? c.status !== "paid" && c.status !== "lost" : true))
    .sort((a, b) => Number(lotOf.get(a.property_id ?? "") ?? 0) - Number(lotOf.get(b.property_id ?? "") ?? 0));
  const due = round2(rows.reduce((s, c) => s + num(c.amount_due), 0));
  const paid = round2(rows.reduce((s, c) => s + Math.min(num(c.amount_paid), num(c.amount_due)), 0));
  const pct = due > 0 ? Math.round((paid / due) * 100) : 0;
  const [y, m] = month.split("-").map(Number);

  const done = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const setPaid = (c: VCharge, amount: number) =>
    done(async () => {
      const next = { ...c, amount_paid: amount, paid_on: amount > 0 ? c.paid_on ?? todayIso() : null };
      const { error } = await supabase.from("voldis_charges").update({ amount_paid: amount, paid_on: next.paid_on, status: statusFor(next) }).eq("id", c.id);
      if (error) toast.error("Erreur : " + error.message);
    });

  const partial = (c: VCharge) => {
    const raw = window.prompt(`Montant encaissé (dû ${eur(num(c.amount_due))}) :\nПолученная сумма:`, String(num(c.amount_paid)));
    if (raw === null) return;
    const v = Number(raw.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return toast.error("Montant invalide / Неверная сумма");
    void setPaid(c, v);
  };

  const markLost = (c: VCharge) => {
    if (!window.confirm("Marquer cette échéance comme perdue ?\nОтметить как безвозвратно потерянную?")) return;
    void done(async () => {
      await supabase.from("voldis_charges").update({ status: "lost" }).eq("id", c.id);
    });
  };

  const removeCharge = (c: VCharge) => {
    if (!window.confirm("Supprimer cette échéance ?\nУдалить платёж?")) return;
    void done(async () => {
      const { error } = await supabase.from("voldis_charges").delete().eq("id", c.id);
      if (error) toast.error("Erreur : " + error.message);
    });
  };

  const generate = () => {
    const first = `${month}-01`;
    const last = monthEnd(y, m);
    const have = new Set(charges.filter((c) => c.kind === "rent" && c.lease_id && c.due_date.slice(0, 7) === month).map((c) => c.lease_id!));
    const todo = leases.filter((l) => l.is_active && l.start_date <= last && (!l.end_date || l.end_date >= first) && !have.has(l.id));
    if (todo.length === 0) return toast.success("Tout est déjà créé / Всё уже создано");
    if (!window.confirm(`Créer ${todo.length} loyer(s) pour ${MONTHS[m - 1]} ${y} ?\nСоздать платежи: ${todo.length}`)) return;
    void done(async () => {
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
      if (error) toast.error("Erreur : " + error.message);
      else toast.success(`${todo.length} loyer(s) créé(s)`);
    });
  };

  const invoiceAndOpen = (c: VCharge, kind: "invoice" | "receipt") =>
    done(async () => {
      const inv = await ensureInvoice(c.id, kind);
      if (inv) openPdf(inv.id);
    });

  const send = (c: VCharge, kind: "invoice" | "receipt") => {
    const t = tenantName.get(c.tenant_id ?? "");
    const to = t?.billing_email ?? t?.email;
    if (!to) return toast.error("Pas d'e-mail pour ce locataire : ajoutez-le sur sa fiche. / Нет почты у арендатора");
    if (!window.confirm(`Envoyer la ${kind === "receipt" ? "quittance" : "facture"} à ${t?.name} (${to}) ?\nОтправить ${kind === "receipt" ? "квитанцию" : "счёт"}?`)) return;
    void done(async () => {
      const inv = await ensureInvoice(c.id, kind);
      if (inv) await sendInvoice(inv, to);
    });
  };

  const sendAll = () => {
    const targets = rows.filter((c) => c.kind === "rent" && !invoiceBy.get(`${c.id}|invoice`)?.sent_at);
    const withMail = targets.filter((c) => {
      const t = tenantName.get(c.tenant_id ?? "");
      return !!(t?.billing_email ?? t?.email);
    });
    if (withMail.length === 0) return toast.success("Rien à envoyer / Нечего отправлять");
    const list = withMail.map((c) => `• ${tenantName.get(c.tenant_id ?? "")?.name} — ${eur(num(c.amount_due))}`).join("\n");
    const skipped = targets.length - withMail.length;
    if (!window.confirm(`Envoyer ${withMail.length} facture(s) ?${skipped ? ` (${skipped} sans e-mail ignorée(s))` : ""}\nОтправить счета:\n\n${list}`)) return;
    void done(async () => {
      let ok = 0;
      for (const c of withMail) {
        const inv = await ensureInvoice(c.id, "invoice");
        if (inv && (await sendInvoice(inv, null))) ok++;
      }
      toast.success(`${ok}/${withMail.length} envoyée(s)`);
    });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="rounded-lg px-2.5 py-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mois précédent">
            ‹
          </button>
          <h2 className="min-w-40 text-center text-lg font-extrabold tracking-tight text-stone-900">
            {MONTHS[m - 1]} {y}
          </h2>
          <button className="rounded-lg px-2.5 py-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mois suivant">
            ›
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-500">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Impayés seulement
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn btn-secondary" disabled={busy} onClick={generate}>
            <Bi fr="Créer les loyers du mois" ru="Создать аренду за месяц" />
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={sendAll}>
            <Bi fr="Envoyer les factures" ru="Отправить счета" />
          </button>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Bi fr="+ Échéance" ru="+ Платёж" />
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mb-5">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-stone-500">
              Encaissé <strong className="text-stone-900">{eur(paid)}</strong> sur {eur(due)}
            </span>
            <span className="font-semibold text-stone-700">{pct} %</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3">Lot</th>
              <th className="px-4 py-3">Locataire</th>
              <th className="px-4 py-3 text-right">Dû</th>
              <th className="px-4 py-3 text-right">Encaissé</th>
              <th className="px-4 py-3">État</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((c) => {
              const t = tenantName.get(c.tenant_id ?? "");
              const inv = invoiceBy.get(`${c.id}|invoice`);
              const rec = invoiceBy.get(`${c.id}|receipt`);
              const open = c.status !== "paid" && c.status !== "lost";
              return (
                <tr key={c.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 font-bold text-stone-800">{lotOf.get(c.property_id ?? "") ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-800">{t?.name ?? "—"}</div>
                    <div className="text-xs text-stone-400">
                      échéance {frDate(c.due_date)}
                      {inv && <span> · {inv.number}{inv.sent_at ? " envoyée" : ""}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{eur(num(c.amount_due))}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {num(c.amount_paid) > 0 ? eur(num(c.amount_paid)) : <span className="text-stone-300">—</span>}
                    {c.paid_on && <div className="text-xs text-stone-400">{frDate(c.paid_on)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Status tone={tone(c.status)}>
                      {STATUS_LABEL[c.status].fr}
                      {c.status === "partial" && ` · reste ${eur(remaining(c))}`}
                    </Status>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {open && (
                      <button className="btn btn-secondary mr-1 px-3 py-1 text-xs" disabled={busy} onClick={() => void setPaid(c, num(c.amount_due))}>
                        <Bi fr="Encaissé" ru="Оплачено" />
                      </button>
                    )}
                    <Menu
                      items={[
                        { label: inv ? `Ouvrir la facture ${inv.number}` : "Créer la facture (PDF)", onClick: () => void invoiceAndOpen(c, "invoice") },
                        { label: inv?.sent_at ? "Renvoyer la facture" : "Envoyer la facture", onClick: () => send(c, "invoice") },
                        ...(num(c.amount_paid) > 0
                          ? [
                              { label: rec ? `Ouvrir la quittance ${rec.number}` : "Créer la quittance (PDF)", onClick: () => void invoiceAndOpen(c, "receipt") },
                              { label: "Envoyer la quittance", onClick: () => send(c, "receipt") },
                            ]
                          : []),
                        ...(open ? [{ label: "Encaissement partiel…", onClick: () => partial(c) }, { label: "Marquer perdu", onClick: () => markLost(c) }] : []),
                        ...(c.status === "paid" ? [{ label: "Annuler l'encaissement", onClick: () => void setPaid(c, 0) }] : []),
                        { label: "Supprimer", onClick: () => removeCharge(c), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>Aucune échéance en {MONTHS[m - 1].toLowerCase()} — « Créer les loyers du mois » les génère depuis les baux.</Empty>}
      </div>
      {addOpen && <ChargeModal supabase={supabase} tenants={tenants} leases={leases} props={props} defaultMonth={month} onClose={() => setAddOpen(false)} onSaved={() => void reload()} />}
    </div>
  );
}
