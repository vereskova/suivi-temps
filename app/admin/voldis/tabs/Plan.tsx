"use client";

import { useMemo, useState } from "react";
import { proposeMatches } from "@/lib/voldis/matching";
import { leaseCoversMonth, num, remaining, rentState, round2, ymOf, type VLease } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import LotCard from "../LotCard";
import SitePlan, { LOT_STATE_LEGEND, type LotState } from "../SitePlan";
import { eur, eur0, frDate, todayIso } from "../ui";
import { remindTenant } from "../actions";

type Tab = "plan" | "mois" | "banque" | "reglages";
type Item = { key: string; text: string; sub: string; tone: "bad" | "warn" | "idle"; action?: { label: string; onClick: () => void } };

export default function Plan({ supabase, data, go }: { supabase: Supabase; data: VoldisData; go: (t: Tab) => void }) {
  const { props, tenants, leases, charges, txs, reload } = data;
  const [openLot, setOpenLot] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayIso();
  const month = today.slice(0, 7);
  const [in60] = useState(() => new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10));

  const tenantBy = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);
  const lotBy = useMemo(() => new Map(props.map((p) => [p.id, p])), [props]);
  const active = leases.filter((l) => l.is_active);

  // Цвет каждого помещения: состояние платежа этого месяца
  const states = useMemo(() => {
    const m = new Map<string, LotState>();
    props.forEach((p) => {
      const lease: VLease | undefined = active.find((l) => l.property_id === p.id && leaseCoversMonth(l, month));
      if (!lease) return void m.set(p.lot_number, p.occupant ? "other" : "free");
      const c = charges.find((x) => x.lease_id === lease.id && x.kind === "rent" && ymOf(x.due_date) === month);
      const st = c ? rentState(c, today) : "expected";
      m.set(p.lot_number, st === "paid" ? "paid" : st === "late" ? "late" : "expected");
    });
    return m;
  }, [props, active, charges, month, today]);

  const monthExpected = round2(active.filter((l) => leaseCoversMonth(l, month)).reduce((s, l) => s + num(l.monthly_total), 0));
  const monthPaid = round2(charges.filter((c) => c.kind === "rent" && ymOf(c.due_date) === month).reduce((s, c) => s + Math.min(num(c.amount_paid), num(c.amount_due)), 0));
  const lateCharges = charges.filter((c) => c.kind === "rent" && rentState(c, today) === "late");
  const lateTotal = round2(lateCharges.reduce((s, c) => s + remaining(c), 0));

  const items: Item[] = [];
  const lateBy = new Map<string, { sum: number; n: number }>();
  lateCharges.forEach((c) => {
    if (!c.tenant_id) return;
    const cur = lateBy.get(c.tenant_id) ?? { sum: 0, n: 0 };
    cur.sum = round2(cur.sum + remaining(c));
    cur.n++;
    lateBy.set(c.tenant_id, cur);
  });
  lateBy.forEach((v, id) => {
    const t = tenantBy.get(id);
    if (!t) return;
    items.push({
      key: `late-${id}`,
      text: `${t.name}: просрочено ${eur(v.sum)}`,
      sub: `${v.n} ${v.n === 1 ? "платёж" : "платежа"}`,
      tone: "bad",
      action: {
        label: busy === id ? "Отправка..." : "Напомнить",
        onClick: () => {
          if (!window.confirm(`Отправить напоминание арендатору ${t.name}?`)) return;
          setBusy(id);
          void remindTenant(id).finally(async () => {
            setBusy(null);
            await reload();
          });
        },
      },
    });
  });
  const proposals = proposeMatches(txs, charges, tenants);
  if (proposals.length > 0) {
    items.push({
      key: "bank",
      text: `Банк: ${proposals.length} ${proposals.length === 1 ? "поступление ждёт" : "поступлений ждут"} подтверждения`,
      sub: proposals.slice(0, 3).map((p) => `${p.tenant.name} ${eur(num(p.tx.amount))}`).join(", "),
      tone: "warn",
      action: { label: "Открыть банк", onClick: () => go("banque") },
    });
  }
  active
    .filter((l) => l.end_date && l.end_date <= in60)
    .sort((a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? ""))
    .forEach((l) =>
      items.push({
        key: `end-${l.id}`,
        text: `Помещение ${lotBy.get(l.property_id)?.lot_number}, ${tenantBy.get(l.tenant_id)?.name}: договор ${l.end_date! < today ? "истёк" : "заканчивается"} ${frDate(l.end_date)}`,
        sub: l.end_date! < today ? "Платежи по нему больше не ожидаются: продлите или завершите" : "Нужно продлить или завершить",
        tone: l.end_date! < today ? "bad" : "warn",
        action: { label: "Открыть", onClick: () => setOpenLot(l.property_id) },
      })
    );
  const noMail = active.filter((l) => !(tenantBy.get(l.tenant_id)?.email || tenantBy.get(l.tenant_id)?.billing_email));
  if (noMail.length > 0) {
    items.push({
      key: "nomail",
      text: `Нет почты у арендаторов: ${noMail.map((l) => tenantBy.get(l.tenant_id)?.name).join(", ")}`,
      sub: "Без почты нельзя отправить счёт",
      tone: "idle",
      action: { label: "Открыть", onClick: () => setOpenLot(noMail[0].property_id) },
    });
  }

  const dot = { bad: "bg-red-500", warn: "bg-amber-500", idle: "bg-stone-300" };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Аренда в месяц" value={eur0(monthExpected)} sub={`${active.filter((l) => leaseCoversMonth(l, month)).length} действующих договоров`} />
        <Figure label="Получено в этом месяце" value={eur0(monthPaid)} sub={`из ${eur0(monthExpected)}`} bar={monthExpected > 0 ? Math.round((monthPaid / monthExpected) * 100) : undefined} />
        <Figure label="Просрочено" value={eur0(lateTotal)} sub={lateTotal > 0 ? `${lateBy.size} арендатор(а)` : "Всё в порядке"} tone={lateTotal > 0 ? "bad" : "good"} />
      </div>

      {items.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-500">Требует внимания</h3>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot[it.tone]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-stone-800">{it.text}</div>
                  <div className="text-xs text-stone-400">{it.sub}</div>
                </div>
                {it.action && (
                  <button className="btn btn-secondary px-3 py-1.5 text-xs" onClick={it.action.onClick}>
                    {it.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
          <SitePlan props={props} leases={leases} tenants={tenants} states={states} onSelect={(p) => setOpenLot(p.id)} />
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs text-stone-500">
            {LOT_STATE_LEGEND.map((l) => (
              <span key={l.state} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${l.dot}`} />
                {l.label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-stone-400">Нажмите на помещение, чтобы открыть карточку.</p>
        </div>
      </section>

      {openLot && <LotCard supabase={supabase} data={data} lotId={openLot} onClose={() => setOpenLot(null)} />}
    </div>
  );
}

function Figure({ label, value, sub, bar, tone }: { label: string; value: string; sub: string; bar?: number; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-stone-400">{label}</div>
      <div className={`mt-1.5 text-3xl font-extrabold tracking-tight tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-stone-900"}`}>{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
      <div className="mt-2 text-xs text-stone-400">{sub}</div>
    </div>
  );
}


