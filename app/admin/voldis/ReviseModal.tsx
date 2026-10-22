"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import { num, round2, type VLease } from "@/lib/voldis/rental";
import type { Supabase } from "./data";
import { Field, Modal, eur, frDate, todayIso } from "./ui";

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
    if (!Number.isFinite(newValue) || newValue <= 0) return toast.error("Неверная сумма");
    setBusy(true);
    const nextYear = `${Number(when.slice(0, 4)) + 1}${when.slice(4)}`;
    const { error } = await supabase
      .from("voldis_leases")
      .update({ rent_ht: detailed ? newValue : null, vat, monthly_total: total, next_revision_date: nextYear })
      .eq("id", lease.id);
    if (error) {
      setBusy(false);
      return toast.error("Ошибка: " + error.message);
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
    toast.success("Аренда пересмотрена");
    onSaved();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Пересмотр аренды: ${tenantName}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="" ru={detailed ? "Новая аренда без НДС (€)" : "Новая сумма в месяц (€)"}>
          <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
        <Field label="" ru="Начиная с">
          <input className="input" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </div>
      <p className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
        Всего в месяц: <strong className="text-stone-900">{eur(before)}</strong> → <strong className="text-stone-900">{eur(total)}</strong>
        {total !== before && <span className="ml-2 text-stone-400">({total > before ? "+" : ""}{eur(total - before)})</span>}
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-stone-600">
        <input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} />
        Применить к неоплаченным платежам, начиная с {frDate(when)}
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose}>
          Отмена
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void apply()}>
          Применить
        </button>
      </div>
    </Modal>
  );
}
