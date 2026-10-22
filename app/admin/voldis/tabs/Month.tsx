"use client";

import { useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import {
  RENT_STATE_LABEL,
  dueDateOf,
  leaseCoversMonth,
  monthLabelRu,
  num,
  remaining,
  rentState,
  round2,
  shiftMonth,
  ymOf,
  type RentState,
  type VCharge,
  type VInvoice,
  type VLease,
} from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { ChargeModal } from "../forms";
import { Empty, Menu, Status, eur, frDate, todayIso } from "../ui";
import { ensureInvoice, openPdf, remindTenant, sendInvoice, updateCharge } from "../actions";

const tone = (s: RentState) => ({ paid: "good", partial: "warn", late: "bad", expected: "idle", lost: "idle" }[s] as "good" | "warn" | "bad" | "idle");

type Row = { key: string; lease: VLease | null; charge: VCharge | null; lotId: string | null; tenantId: string | null; expected: number; paid: number; state: RentState };

export default function Month({ supabase, data, initialMonth, onOpenLot }: { supabase: Supabase; data: VoldisData; initialMonth?: string; onOpenLot: (lotId: string) => void }) {
  const { charges, leases, tenants, props, invoices, reload } = data;
  const [month, setMonth] = useState(initialMonth ?? todayIso().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const today = todayIso();

  const tenantBy = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);
  const lotBy = useMemo(() => new Map(props.map((p) => [p.id, p])), [props]);
  const invoiceBy = useMemo(() => {
    const m = new Map<string, VInvoice>();
    invoices.filter((i) => i.status !== "void" && i.charge_id).forEach((i) => m.set(`${i.charge_id}|${i.kind}`, i));
    return m;
  }, [invoices]);

  // Строки месяца: все платежи по аренде + «ожидаемые» по действующим договорам, у которых платёж ещё не создан (будущие месяцы)
  const rentCharges = charges.filter((c) => c.kind === "rent" && ymOf(c.due_date) === month);
  const haveLease = new Set(rentCharges.map((c) => c.lease_id).filter(Boolean));
  const rows: Row[] = [
    ...rentCharges.map((c) => ({
      key: c.id,
      lease: leases.find((l) => l.id === c.lease_id) ?? null,
      charge: c,
      lotId: c.property_id,
      tenantId: c.tenant_id,
      expected: num(c.amount_due),
      paid: num(c.amount_paid),
      state: rentState(c, today),
    })),
    ...leases
      .filter((l) => l.is_active && leaseCoversMonth(l, month) && !haveLease.has(l.id))
      .map((l) => ({ key: `virtual-${l.id}`, lease: l, charge: null, lotId: l.property_id, tenantId: l.tenant_id, expected: num(l.monthly_total), paid: 0, state: "expected" as RentState })),
  ].sort((a, b) => (lotBy.get(a.lotId ?? "")?.lot_number ?? "").localeCompare(lotBy.get(b.lotId ?? "")?.lot_number ?? "", "ru", { numeric: true }));
  const oneOff = charges.filter((c) => c.kind !== "rent" && ymOf(c.due_date) === month);

  const expectedTotal = round2(rows.reduce((s, r) => s + r.expected, 0));
  const paidTotal = round2(rows.reduce((s, r) => s + Math.min(r.paid, r.expected), 0));
  const pct = expectedTotal > 0 ? Math.round((paidTotal / expectedTotal) * 100) : 0;

  // Договоры, срок которых вышел: платёж не ожидается, но человек ещё числится в помещении
  const expired = month === today.slice(0, 7) ? leases.filter((l) => l.is_active && l.end_date && l.end_date < `${month}-01`) : [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const markCash = (c: VCharge) =>
    run(async () => {
      if (await updateCharge(supabase, c.id, { amount_paid: num(c.amount_due), paid_on: today, paid_cash: true, status: "paid" })) toast.success("Отмечено: получено наличными");
    });
  const undo = (c: VCharge) => run(() => updateCharge(supabase, c.id, { amount_paid: 0, paid_on: null, paid_cash: false, status: "unpaid" }));
  const partial = (c: VCharge) => {
    const raw = window.prompt(`Полученная сумма (по договору ${eur(num(c.amount_due))}):`, String(num(c.amount_paid)));
    if (raw === null) return;
    const v = Number(raw.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return toast.error("Неверная сумма");
    void run(() => updateCharge(supabase, c.id, { amount_paid: v, paid_on: v > 0 ? c.paid_on ?? today : null }));
  };
  const writeOff = (c: VCharge) => {
    if (!window.confirm("Списать этот платёж (не считать долгом)?")) return;
    void run(() => updateCharge(supabase, c.id, { status: "lost" }));
  };
  const remove = (c: VCharge) => {
    if (num(c.amount_paid) > 0) return toast.error("У платежа есть оплата: сначала отмените её");
    if (!window.confirm("Удалить этот платёж? Он создастся снова, если договор действует. Чтобы платёж не ожидался, завершите договор.")) return;
    void run(async () => {
      const { error } = await supabase.from("voldis_charges").delete().eq("id", c.id);
      if (error) toast.error("Ошибка: " + error.message);
    });
  };

  const docAction = (c: VCharge, kind: "invoice" | "receipt", send: boolean) => {
    const t = tenantBy.get(c.tenant_id ?? "");
    const to = t?.billing_email ?? t?.email;
    if (send) {
      if (!to) return toast.error("У арендатора нет почты: добавьте её в карточке помещения");
      if (!window.confirm(`Отправить ${kind === "receipt" ? "квитанцию" : "счёт"} арендатору ${t?.name} (${to})?`)) return;
    }
    void run(async () => {
      const inv = await ensureInvoice(c.id, kind);
      if (!inv) return;
      if (send) await sendInvoice(inv);
      else openPdf(inv.id);
    });
  };

  const sendAllInvoices = () => {
    const targets = rows.filter((r) => r.charge && !invoiceBy.get(`${r.charge.id}|invoice`)?.sent_at && (tenantBy.get(r.tenantId ?? "")?.billing_email ?? tenantBy.get(r.tenantId ?? "")?.email));
    if (targets.length === 0) return toast.success("Нечего отправлять: все счета уже отправлены");
    const list = targets.map((r) => `• ${tenantBy.get(r.tenantId ?? "")?.name}: ${eur(r.expected)}`).join("\n");
    if (!window.confirm(`Отправить счета (${targets.length}):\n\n${list}`)) return;
    void run(async () => {
      let ok = 0;
      for (const r of targets) {
        const inv = await ensureInvoice(r.charge!.id, "invoice");
        if (inv && (await sendInvoice(inv))) ok++;
      }
      toast.success(`Отправлено: ${ok} из ${targets.length}`);
    });
  };

  const [y, m] = month.split("-").map(Number);
  void y;
  void m;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="rounded-lg px-2.5 py-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">
            ‹
          </button>
          <h2 className="min-w-44 text-center text-lg font-extrabold tracking-tight text-stone-900">{monthLabelRu(month)}</h2>
          <button className="rounded-lg px-2.5 py-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">
            ›
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn btn-secondary" disabled={busy} onClick={sendAllInvoices}>
            Отправить счета
          </button>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            + Разовый платёж
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mb-5">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-stone-500">
              Получено <strong className="text-stone-900">{eur(paidTotal)}</strong> из {eur(expectedTotal)}
            </span>
            <span className="font-semibold text-stone-700">{pct} %</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Срок договора истёк, платежи по нему не ожидаются:{" "}
          {expired.map((l) => (
            <button key={l.id} className="mr-2 font-semibold underline" onClick={() => onOpenLot(l.property_id)}>
              помещение {lotBy.get(l.property_id)?.lot_number}, {tenantBy.get(l.tenant_id)?.name} (до {frDate(l.end_date)})
            </button>
          ))}
          <span className="text-amber-800/80">Продлите договор в карточке помещения.</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-400">
              <th className="px-4 py-3">Помещение</th>
              <th className="px-4 py-3">Арендатор</th>
              <th className="px-4 py-3 text-right">Ожидается</th>
              <th className="px-4 py-3 text-right">Получено</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => {
              const c = r.charge;
              const t = tenantBy.get(r.tenantId ?? "");
              const lot = lotBy.get(r.lotId ?? "");
              const inv = c ? invoiceBy.get(`${c.id}|invoice`) : undefined;
              const rec = c ? invoiceBy.get(`${c.id}|receipt`) : undefined;
              const open = r.state !== "paid" && r.state !== "lost";
              return (
                <tr key={r.key} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3">
                    <button className="font-bold text-stone-800 hover:underline" onClick={() => r.lotId && onOpenLot(r.lotId)}>
                      {lot?.lot_number ?? "-"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-800">{t?.name ?? "-"}</div>
                    <div className="text-xs text-stone-400">
                      срок {frDate(c?.due_date ?? (r.lease ? dueDateOf(month, r.lease.billing_day) : null))}
                      {inv && (
                        <span>
                          {" "}
                          · {inv.number}
                          {inv.sent_at ? ", отправлен" : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{eur(r.expected)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.paid > 0 ? eur(r.paid) : <span className="text-stone-300">-</span>}
                    {c?.paid_on && r.paid > 0 && (
                      <div className="text-xs text-stone-400">
                        {frDate(c.paid_on)}
                        {c.paid_cash ? " · нал." : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Status tone={tone(r.state)}>
                      {RENT_STATE_LABEL[r.state]}
                      {r.state === "partial" || (r.state === "late" && r.paid > 0) ? `, осталось ${eur(remaining({ amount_due: r.expected, amount_paid: r.paid }))}` : ""}
                    </Status>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {c && open && (
                      <button className="btn btn-secondary mr-1 px-3 py-1 text-xs" disabled={busy} onClick={() => void markCash(c)}>
                        Наличными
                      </button>
                    )}
                    {c && (
                      <Menu
                        items={[
                          { label: inv ? `Открыть счёт ${inv.number}` : "Создать счёт (PDF)", onClick: () => docAction(c, "invoice", false) },
                          { label: inv?.sent_at ? "Отправить счёт ещё раз" : "Отправить счёт арендатору", onClick: () => docAction(c, "invoice", true) },
                          ...(r.paid > 0
                            ? [
                                { label: rec ? `Открыть квитанцию ${rec.number}` : "Создать квитанцию (PDF)", onClick: () => docAction(c, "receipt", false) },
                                { label: "Отправить квитанцию", onClick: () => docAction(c, "receipt", true) },
                              ]
                            : []),
                          ...(open && r.state === "late" && c.tenant_id
                            ? [
                                {
                                  label: "Напомнить об оплате (письмо)",
                                  onClick: () => {
                                    if (window.confirm(`Отправить напоминание арендатору ${t?.name}?`)) void run(() => remindTenant(c.tenant_id!));
                                  },
                                },
                              ]
                            : []),
                          ...(open ? [{ label: "Частичная оплата...", onClick: () => partial(c) }, { label: "Списать", onClick: () => writeOff(c) }] : []),
                          ...(r.paid > 0 ? [{ label: "Отменить оплату", onClick: () => void undo(c) }] : []),
                          { label: "Удалить платёж", onClick: () => remove(c), danger: true },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-stone-200 font-bold">
                <td className="px-4 py-3" colSpan={2}>
                  Итого
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{eur(expectedTotal)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{eur(paidTotal)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
        {rows.length === 0 && <Empty>В этом месяце нет действующих договоров.</Empty>}
      </div>

      {oneOff.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-stone-500">Разовые платежи</h3>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <ul className="divide-y divide-stone-100 text-sm">
              {oneOff.map((c) => {
                const st = rentState(c, today);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-stone-800">{tenantBy.get(c.tenant_id ?? "")?.name ?? "-"}</span>
                      <span className="ml-2 text-stone-400">{c.description ?? (c.kind === "deposit" ? "Депозит" : "Платёж")}</span>
                    </span>
                    <span className="tabular-nums">{eur(num(c.amount_due))}</span>
                    <Status tone={tone(st)}>{RENT_STATE_LABEL[st]}</Status>
                    {st !== "paid" && (
                      <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => void markCash(c)}>
                        Наличными
                      </button>
                    )}
                    <Menu items={[{ label: "Удалить", onClick: () => remove(c), danger: true }]} />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
      {addOpen && <ChargeModal supabase={supabase} tenants={tenants} leases={leases} props={props} defaultMonth={month} onClose={() => setAddOpen(false)} onSaved={() => void reload()} />}
    </div>
  );
}
