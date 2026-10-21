"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import { num, type VInvoice } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { Bi, Empty, Menu, Status, eur, frDate } from "../ui";
import { openPdf, sendInvoice } from "./Rents";

export default function Invoices({ supabase, data }: { supabase: Supabase; data: VoldisData }) {
  const { invoices, tenants, reload } = data;
  const [filter, setFilter] = useState<"all" | "invoice" | "receipt">("all");
  const [busy, setBusy] = useState(false);
  const tenantBy = new Map(tenants.map((t) => [t.id, t]));
  const rows = invoices.filter((i) => i.status !== "void").filter((i) => filter === "all" || i.kind === filter);

  const send = async (inv: VInvoice) => {
    const t = tenantBy.get(inv.tenant_id ?? "");
    const to = t?.billing_email ?? t?.email;
    if (!to) return toast.error("Pas d'e-mail pour ce locataire / Нет почты у арендатора");
    if (!window.confirm(`Envoyer ${inv.number} à ${t?.name} (${to}) ?\nОтправить ${inv.number}?`)) return;
    setBusy(true);
    await sendInvoice(inv, to);
    setBusy(false);
    await reload();
  };

  const voidIt = async (inv: VInvoice) => {
    if (!window.confirm(`Annuler ${inv.number} ? Une nouvelle pourra être créée pour l'échéance.\nАннулировать ${inv.number}?`)) return;
    const { error } = await supabase.from("voldis_invoices").update({ status: "void" }).eq("id", inv.id);
    if (error) toast.error("Erreur : " + error.message);
    await reload();
  };

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {(
          [
            ["all", "Tout", "Все"],
            ["invoice", "Factures", "Счета"],
            ["receipt", "Quittances", "Квитанции"],
          ] as const
        ).map(([k, fr, ru]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${filter === k ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>
            <Bi fr={fr} ru={ru} />
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3">Numéro</th>
              <th className="px-4 py-3">Locataire</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">État</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((i) => (
              <tr key={i.id} className="hover:bg-stone-50/60">
                <td className="px-4 py-3 font-semibold text-stone-800">
                  <button className="hover:underline" onClick={() => openPdf(i.id)}>
                    {i.number}
                  </button>
                  <div className="text-xs font-normal text-stone-400">{i.kind === "receipt" ? "Quittance" : "Facture"}</div>
                </td>
                <td className="px-4 py-3">{tenantBy.get(i.tenant_id ?? "")?.name ?? "—"}</td>
                <td className="px-4 py-3 text-stone-500">{frDate(i.issue_date)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{eur(num(i.total_ttc))}</td>
                <td className="px-4 py-3">
                  {i.sent_at ? <Status tone="good">Envoyée {frDate(i.sent_at)}</Status> : <Status tone="idle">Non envoyée</Status>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button className="btn btn-secondary mr-1 px-3 py-1 text-xs" onClick={() => openPdf(i.id)}>
                    PDF
                  </button>
                  <button className="btn btn-secondary mr-1 px-3 py-1 text-xs" disabled={busy} onClick={() => void send(i)}>
                    <Bi fr={i.sent_at ? "Renvoyer" : "Envoyer"} ru={i.sent_at ? "Повторить" : "Отправить"} />
                  </button>
                  <Menu items={[{ label: "Annuler", onClick: () => void voidIt(i), danger: true }]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>Aucune facture pour l&apos;instant — créez-les depuis l&apos;onglet Loyers.</Empty>}
      </div>
    </div>
  );
}
