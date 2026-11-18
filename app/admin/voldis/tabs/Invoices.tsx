"use client";

import { useMemo, useState } from "react";
import { monthLabelRu, num, type VInvoice } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { openPdf, sendInvoice } from "../actions";
import { Empty, Status, eur, frDate } from "../ui";

const KIND: Record<VInvoice["kind"], string> = { invoice: "Счёт", receipt: "Квитанция" };
const STATUS: Record<VInvoice["status"], { tone: "good" | "warn" | "bad" | "idle"; label: string }> = {
  draft: { tone: "idle", label: "Черновик" },
  sent: { tone: "good", label: "Отправлен" },
  void: { tone: "bad", label: "Аннулирован" },
};

/** История всех счетов и квитанций VOLDIS: поиск, фильтры, PDF, отправка. */
export default function Invoices({ data }: { supabase: Supabase; data: VoldisData }) {
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const tenantName = useMemo(() => new Map(data.tenants.map((t) => [t.id, t.name])), [data.tenants]);
  const lotOfCharge = useMemo(() => {
    const lotById = new Map(data.props.map((p) => [p.id, p.lot_number]));
    return new Map(data.charges.map((c) => [c.id, c.property_id ? (lotById.get(c.property_id) ?? "") : ""]));
  }, [data.charges, data.props]);

  const years = useMemo(() => Array.from(new Set(data.invoices.map((i) => i.issue_date.slice(0, 4)))).sort().reverse(), [data.invoices]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.invoices
      .filter((i) => (!year || i.issue_date.startsWith(year)) && (!tenantId || i.tenant_id === tenantId) && (!kind || i.kind === kind))
      .filter((i) => !needle || i.number.toLowerCase().includes(needle) || (tenantName.get(i.tenant_id ?? "") ?? "").toLowerCase().includes(needle))
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date) || b.number.localeCompare(a.number));
  }, [data.invoices, year, tenantId, kind, q, tenantName]);

  const total = rows.filter((i) => i.status !== "void").reduce((a, i) => a + num(i.total_ttc), 0);

  async function send(inv: VInvoice) {
    setBusy(inv.id);
    if (await sendInvoice(inv)) await data.reload();
    setBusy(null);
  }

  const FIELD = "rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${FIELD} w-56`} placeholder="Поиск: номер или арендатор" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={FIELD} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Все годы</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select className={FIELD} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">Все арендаторы</option>
          {data.tenants
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
        <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Счета и квитанции</option>
          <option value="invoice">Только счета</option>
          <option value="receipt">Только квитанции</option>
        </select>
        <p className="ml-auto text-sm text-stone-500">
          Документов: <b className="text-stone-800">{rows.length}</b> · сумма (без аннулированных): <b className="text-stone-800">{eur(total)}</b>
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty>Счетов пока нет</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
                <th className="px-4 py-3">Номер</th>
                <th className="px-3 py-3">Дата</th>
                <th className="px-3 py-3">Арендатор</th>
                <th className="px-3 py-3">Период</th>
                <th className="px-3 py-3 text-right">Сумма TTC</th>
                <th className="px-3 py-3">Статус</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const st = STATUS[i.status];
                const lot = i.charge_id ? lotOfCharge.get(i.charge_id) : "";
                return (
                  <tr key={i.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <button type="button" className="font-semibold text-stone-900 underline-offset-2 hover:underline" onClick={() => openPdf(i.id)}>
                        {i.number}
                      </button>
                      <span className="ml-2 text-xs text-stone-400">{KIND[i.kind]}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-stone-700">{frDate(i.issue_date)}</td>
                    <td className="px-3 py-3 text-stone-800">
                      {tenantName.get(i.tenant_id ?? "") ?? "-"}
                      {lot ? <span className="ml-2 text-xs text-stone-400">{lot}</span> : null}
                    </td>
                    <td className="px-3 py-3 text-stone-600">{i.period_start ? monthLabelRu(i.period_start) : "-"}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{eur(num(i.total_ttc))}</td>
                    <td className="px-3 py-3">
                      <Status tone={st.tone}>{st.label}</Status>
                      {i.status === "sent" && i.sent_at ? <span className="ml-2 text-xs text-stone-400">{frDate(i.sent_at)}{i.sent_to ? ` · ${i.sent_to}` : ""}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <button type="button" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100" onClick={() => openPdf(i.id)}>
                        PDF
                      </button>
                      {i.status === "draft" && i.kind === "invoice" ? (
                        <button type="button" disabled={busy === i.id} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50" onClick={() => send(i)}>
                          {busy === i.id ? "…" : "Отправить"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
