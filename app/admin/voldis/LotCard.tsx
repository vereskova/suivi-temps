"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import { RENT_STATE_LABEL, dueDateOf, monthEnd, monthLabelRu, num, remaining, rentState, shiftMonth, ymOf, type RentState, type VCharge, type VLease } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "./data";
import { DocumentsPanel, LeaseModal, LotModal, TenantModal } from "./forms";
import { ReviseModal } from "./ReviseModal";
import { Field, Menu, Modal, Status, eur, frDate, todayIso } from "./ui";
import { ensureInvoice, insertCharges, openPdf, remindTenant, sendInvoice, updateCharge } from "./actions";

const tone = (s: RentState) => ({ paid: "good", partial: "warn", late: "bad", expected: "idle", lost: "idle" }[s] as "good" | "warn" | "bad" | "idle");

/** Одна карточка помещения: арендатор, договор, платежи по месяцам, документы. Здесь делается всё. */
export default function LotCard({ supabase, data, lotId, onClose }: { supabase: Supabase; data: VoldisData; lotId: string; onClose: () => void }) {
  const { props, tenants, leases, charges, docs, invoices, reload } = data;
  const lot = props.find((p) => p.id === lotId);
  const [modal, setModal] = useState<"lot" | "tenant" | "lease" | "newLease" | "revise" | "advance" | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  if (!lot) return null;

  const lotLeases = leases.filter((l) => l.property_id === lot.id).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const lease = lotLeases.find((l) => l.is_active) ?? null;
  const tenant = lease ? tenants.find((t) => t.id === lease.tenant_id) ?? null : null;
  const past = lotLeases.filter((l) => !l.is_active);
  const rentCharges = charges.filter((c) => c.property_id === lot.id && c.kind === "rent").sort((a, b) => b.due_date.localeCompare(a.due_date));
  const shown = rentCharges.slice(0, 12);
  const invoiceBy = new Map(invoices.filter((i) => i.status !== "void" && i.charge_id).map((i) => [`${i.charge_id}|${i.kind}`, i]));
  const openPast = rentCharges.filter((c) => c.lease_id === lease?.id && rentState(c, today) !== "paid" && c.due_date <= today && c.status !== "lost");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      await reload();
    }
  };
  const cash = (c: VCharge) => run(() => updateCharge(supabase, c.id, { amount_paid: num(c.amount_due), paid_on: c.paid_on ?? today, paid_cash: true, status: "paid" }));
  const cashAll = () => {
    if (!window.confirm(`Отметить все прошлые неоплаченные месяцы (${openPast.length}) как полученные наличными?`)) return;
    void run(async () => {
      for (const c of openPast) await updateCharge(supabase, c.id, { amount_paid: num(c.amount_due), paid_on: c.due_date, paid_cash: true, status: "paid" });
      toast.success("Готово");
    });
  };
  const doc = (c: VCharge, kind: "invoice" | "receipt", send: boolean) => {
    if (send) {
      const to = tenant?.billing_email ?? tenant?.email;
      if (!to) return toast.error("У арендатора нет почты: добавьте её");
      if (!window.confirm(`Отправить ${kind === "receipt" ? "квитанцию" : "счёт"} (${to})?`)) return;
    }
    void run(async () => {
      const inv = await ensureInvoice(c.id, kind);
      if (!inv) return;
      if (send) await sendInvoice(inv);
      else openPdf(inv.id);
    });
  };

  const hasLate = rentCharges.some((c) => rentState(c, today) === "late" && c.lease_id === lease?.id);

  return (
    <>
      <Modal
        open
        onClose={onClose}
        width="max-w-3xl"
        title={
          <span>
            Помещение {lot.lot_number}
            <span className="ml-3 text-sm font-medium text-stone-400">
              {lot.kind}
              {lot.surface_m2 ? ` · ${num(lot.surface_m2)} м²` : ""}
            </span>
          </span>
        }
      >
        {/* Арендатор и договор */}
        {lease && tenant ? (
          <section className="rounded-2xl bg-stone-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold tracking-tight text-stone-900">{tenant.name}</div>
                <div className="text-sm text-stone-500">
                  {[tenant.email, tenant.phone].filter(Boolean).join(" · ") || <span className="text-amber-700">нет контактов</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal("tenant")}>
                  Арендатор
                </button>
                <button className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal("lease")}>
                  Договор
                </button>
                <button className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => setModal("revise")}>
                  Пересмотр аренды
                </button>
              </div>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Term label="Сумма в месяц" value={<strong className="text-stone-900">{eur(num(lease.monthly_total))}</strong>} />
              <Term
                label="Состав"
                value={
                  lease.rent_ht != null
                    ? `${eur(num(lease.rent_ht))} аренда + ${eur(num(lease.vat))} НДС${num(lease.charges) ? ` + ${eur(num(lease.charges))} расходы` : ""}`
                    : "общая сумма, без НДС"
                }
              />
              <Term label="Срок" value={`${frDate(lease.start_date)} - ${lease.end_date ? frDate(lease.end_date) : "бессрочно"}`} />
              <Term label="Депозит" value={num(lease.deposit) > 0 ? eur(num(lease.deposit)) : "нет"} />
              <Term label="Индексация" value={lease.index_type && lease.index_type !== "none" ? `${lease.index_type}, следующая ${frDate(lease.next_revision_date)}` : "нет"} />
              <Term label="Оплата" value={lot.pays_cash ? "наличными" : "банковским переводом"} />
            </dl>
            {lease.notes && <p className="mt-3 text-xs text-stone-500">{lease.notes}</p>}
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-stone-300 p-5 text-center">
            {lot.occupant ? (
              <p className="text-sm text-stone-600">
                Занято: <strong className="text-stone-900">{lot.occupant}</strong>
                {lot.pays_cash ? " (платит наличными)" : ""}. Договор не оформлен.
              </p>
            ) : (
              <p className="text-sm text-stone-500">Помещение свободно.</p>
            )}
            <button className="btn btn-primary mt-3" onClick={() => setModal("newLease")}>
              Сдать помещение
            </button>
          </section>
        )}

        {/* Платежи по месяцам */}
        {lease && (
          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">Платежи по месяцам</h3>
              <div className="flex gap-3 text-sm font-semibold">
                {openPast.length > 1 && (
                  <button className="text-primary-700 hover:underline" disabled={busy} onClick={cashAll}>
                    Отметить прошлые месяцы наличными ({openPast.length})
                  </button>
                )}
                <button className="text-primary-700 hover:underline" disabled={busy} onClick={() => setModal("advance")}>
                  Оплата вперёд
                </button>
                {hasLate && tenant && (
                  <button
                    className="text-primary-700 hover:underline"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Отправить напоминание арендатору ${tenant.name}?`)) void run(() => remindTenant(tenant.id));
                    }}
                  >
                    Напомнить об оплате
                  </button>
                )}
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="py-4 text-sm text-stone-400">Платежей пока нет.</p>
            ) : (
              <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
                {shown.map((c) => {
                  const st = rentState(c, today);
                  const inv = invoiceBy.get(`${c.id}|invoice`);
                  const rec = invoiceBy.get(`${c.id}|receipt`);
                  const open = st !== "paid" && st !== "lost";
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="w-32 shrink-0 font-medium text-stone-800">{monthLabelRu(ymOf(c.due_date))}</span>
                      <span className="w-24 shrink-0 tabular-nums text-stone-500">{eur(num(c.amount_due))}</span>
                      <span className="min-w-0 flex-1 text-xs text-stone-400">
                        {num(c.amount_paid) > 0 ? `получено ${eur(num(c.amount_paid))}${c.paid_on ? `, ${frDate(c.paid_on)}` : ""}${c.paid_cash ? ", нал." : ""}` : ""}
                      </span>
                      <Status tone={tone(st)}>
                        {RENT_STATE_LABEL[st]}
                        {st === "partial" ? `, ${eur(remaining(c))}` : ""}
                      </Status>
                      {open && (
                        <button className="btn btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => void cash(c)}>
                          Наличными
                        </button>
                      )}
                      <Menu
                        items={[
                          { label: inv ? `Открыть счёт ${inv.number}` : "Создать счёт (PDF)", onClick: () => doc(c, "invoice", false) },
                          { label: "Отправить счёт арендатору", onClick: () => doc(c, "invoice", true) },
                          ...(num(c.amount_paid) > 0
                            ? [
                                { label: rec ? `Открыть квитанцию ${rec.number}` : "Создать квитанцию (PDF)", onClick: () => doc(c, "receipt", false) },
                                { label: "Отправить квитанцию", onClick: () => doc(c, "receipt", true) },
                                { label: "Отменить оплату", onClick: () => void run(() => updateCharge(supabase, c.id, { amount_paid: 0, paid_on: null, paid_cash: false, status: "unpaid" })) },
                              ]
                            : []),
                        ]}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* Документы */}
        <section className="mt-6 border-t border-stone-100 pt-5">
          {lease ? (
            <DocumentsPanel supabase={supabase} docs={docs} leaseId={lease.id} tenantId={lease.tenant_id} propertyId={lot.id} defaultKind="contract" onChanged={() => void reload()} />
          ) : (
            <p className="text-sm text-stone-400">Документы появятся после оформления договора.</p>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-6 border-t border-stone-100 pt-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-stone-500">Прежние арендаторы</h3>
            <ul className="space-y-1 text-sm text-stone-600">
              {past.map((l) => (
                <li key={l.id}>
                  <strong className="text-stone-800">{tenants.find((t) => t.id === l.tenant_id)?.name}</strong>
                  <span className="text-stone-400"> · {frDate(l.start_date)} - {frDate(l.terminated_on ?? l.end_date)} · {eur(num(l.monthly_total))} в месяц</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex justify-between">
          <button className="text-sm font-semibold text-stone-500 hover:underline" onClick={() => setModal("lot")}>
            Изменить помещение
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </Modal>

      {modal === "lot" && <LotModal supabase={supabase} lot={lot} onClose={() => setModal(null)} onSaved={() => void reload()} />}
      {modal === "tenant" && tenant && <TenantModal supabase={supabase} tenant={tenant} onClose={() => setModal(null)} onSaved={() => void reload()} />}
      {modal === "lease" && lease && (
        <LeaseModal supabase={supabase} lease={lease} props={props} tenants={tenants} leases={leases} docs={docs} onClose={() => setModal(null)} onSaved={() => void reload()} />
      )}
      {modal === "newLease" && (
        <LeaseModal supabase={supabase} lease={null} props={props} tenants={tenants} leases={leases} docs={docs} defaultPropertyId={lot.id} onClose={() => setModal(null)} onSaved={() => void reload()} />
      )}
      {modal === "advance" && lease && (
        <AdvanceModal supabase={supabase} lease={lease} cash={lot.pays_cash} lastMonth={rentCharges.filter((c) => c.lease_id === lease.id).map((c) => ymOf(c.due_date)).sort().pop() ?? todayIso().slice(0, 7)} existing={new Set(rentCharges.filter((c) => c.lease_id === lease.id).map((c) => ymOf(c.due_date)))} onClose={() => setModal(null)} onSaved={() => void reload()} />
      )}
      {modal === "revise" && lease && <ReviseModal supabase={supabase} lease={lease} tenantName={tenant?.name ?? ""} onClose={() => setModal(null)} onSaved={() => void reload()} />}
    </>
  );
}

function Term({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-stone-400">{label}</dt>
      <dd className="min-w-0 text-stone-700">{value}</dd>
    </div>
  );
}


/** Арендатор заплатил за несколько месяцев вперёд: создаём оплаченные платежи на ближайшие месяцы. */
function AdvanceModal({ supabase, lease, cash, lastMonth, existing, onClose, onSaved }: { supabase: Supabase; lease: VLease; cash: boolean; lastMonth: string; existing: Set<string>; onClose: () => void; onSaved: () => void }) {
  const [months, setMonths] = useState("2");
  const [when, setWhen] = useState(todayIso());
  const [isCash, setIsCash] = useState(cash);
  const [busy, setBusy] = useState(false);
  const n = Math.min(24, Math.max(1, Number(months) || 1));
  const list = Array.from({ length: n }, (_, i) => shiftMonth(lastMonth, i + 1)).filter((ym) => !existing.has(ym));

  async function save() {
    if (list.length === 0) return toast.error("Эти месяцы уже есть");
    setBusy(true);
    const ok = await insertCharges(
      supabase,
      list.map((ym) => ({
        lease_id: lease.id,
        property_id: lease.property_id,
        tenant_id: lease.tenant_id,
        kind: "rent",
        due_date: dueDateOf(ym, lease.billing_day),
        period_start: `${ym}-01`,
        period_end: monthEnd(Number(ym.slice(0, 4)), Number(ym.slice(5, 7))),
        amount_due: lease.monthly_total,
        vat_amount: num(lease.vat),
        amount_paid: lease.monthly_total,
        paid_on: when,
        paid_cash: isCash,
        status: "paid",
        description: `Аренда ${ym} (оплата вперёд)`,
      }))
    );
    setBusy(false);
    if (!ok) return;
    toast.success(`Оплачено вперёд: ${list.map((ym) => monthLabelRu(ym)).join(", ")}`);
    onSaved();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Оплата вперёд">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="" ru="На сколько месяцев">
          <input className="input" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} autoFocus />
        </Field>
        <Field label="" ru="Дата получения">
          <input className="input" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-stone-600 sm:col-span-2">
          <input type="checkbox" checked={isCash} onChange={(e) => setIsCash(e.target.checked)} />
          Получено наличными (не через банк)
        </label>
      </div>
      <p className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
        {list.length === 0 ? (
          "Эти месяцы уже есть в списке платежей."
        ) : (
          <>
            Будут отмечены оплаченными: <strong className="text-stone-900">{list.map((ym) => monthLabelRu(ym)).join(", ")}</strong>, по {eur(num(lease.monthly_total))} за месяц (всего {eur(num(lease.monthly_total) * list.length)}).
          </>
        )}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose}>
          Отмена
        </button>
        <button className="btn btn-primary" disabled={busy || list.length === 0} onClick={() => void save()}>
          Отметить оплаченными
        </button>
      </div>
    </Modal>
  );
}
