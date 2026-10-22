"use client";

import { useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { num, round2, DOCUMENT_KIND_LABEL, type VCharge, type VDocument, type VLease, type VProperty, type VTenant } from "@/lib/voldis/rental";
import type { Supabase } from "./data";
import { Field, Modal, eur, frDate, todayIso } from "./ui";

const textOrNull = (s: string) => (s.trim() === "" ? null : s.trim());
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const err = (e: { message: string }) => toast.error("Ошибка: " + e.message);

function Footer({ onClose, onSave, busy, saveLabel = "Сохранить" }: { onClose: () => void; onSave: () => void; busy: boolean; saveLabel?: string }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button className="btn btn-secondary" onClick={onClose}>
        Отмена
      </button>
      <button className="btn btn-primary" disabled={busy} onClick={onSave}>
        {saveLabel}
      </button>
    </div>
  );
}

// ───────────────────────── Арендатор ─────────────────────────

export function TenantModal({ supabase, tenant, onClose, onSaved }: { supabase: Supabase; tenant: VTenant | null; onClose: () => void; onSaved: (t: VTenant) => void }) {
  const [f, setF] = useState({
    name: tenant?.name ?? "",
    representative: tenant?.representative ?? "",
    siren: tenant?.siren ?? "",
    vat_number: tenant?.vat_number ?? "",
    email: tenant?.email ?? "",
    billing_email: tenant?.billing_email ?? "",
    phone: tenant?.phone ?? "",
    address: tenant?.address ?? "",
    notes: tenant?.notes ?? "",
    is_active: tenant?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim()) return toast.error("Укажите название");
    setBusy(true);
    const row = {
      name: f.name.trim(),
      representative: textOrNull(f.representative),
      siren: textOrNull(f.siren),
      vat_number: textOrNull(f.vat_number),
      email: textOrNull(f.email),
      billing_email: textOrNull(f.billing_email),
      phone: textOrNull(f.phone),
      address: textOrNull(f.address),
      notes: textOrNull(f.notes),
      is_active: f.is_active,
    };
    const q = tenant ? supabase.from("voldis_tenants").update(row).eq("id", tenant.id) : supabase.from("voldis_tenants").insert(row);
    const { data, error } = await q.select("*").single();
    setBusy(false);
    if (error) return err(error);
    toast.success(tenant ? "Сохранено" : "Арендатор добавлен");
    onSaved(data as VTenant);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={tenant ? tenant.name : "Новый арендатор"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="" ru="Название компании" className="sm:col-span-2">
          <input className="input" value={f.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label="" ru="Контактное лицо">
          <input className="input" value={f.representative} onChange={set("representative")} />
        </Field>
        <Field label="" ru="Телефон">
          <input className="input" value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label="" ru="Почта">
          <input className="input" type="email" value={f.email} onChange={set("email")} />
        </Field>
        <Field label="" ru="Почта для счетов" hint="Если отличается от основной">
          <input className="input" type="email" value={f.billing_email} onChange={set("billing_email")} />
        </Field>
        <Field label="" ru="SIREN">
          <input className="input" value={f.siren} onChange={set("siren")} />
        </Field>
        <Field label="" ru="Номер НДС">
          <input className="input" value={f.vat_number} onChange={set("vat_number")} />
        </Field>
        <Field label="" ru="Адрес" className="sm:col-span-2">
          <input className="input" value={f.address} onChange={set("address")} />
        </Field>
        <Field label="" ru="Заметки" className="sm:col-span-2">
          <textarea className="input min-h-20" value={f.notes} onChange={set("notes")} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-stone-600 sm:col-span-2">
          <input type="checkbox" checked={!f.is_active} onChange={(e) => setF({ ...f, is_active: !e.target.checked })} />
          В архив (бывший арендатор)
        </label>
      </div>
      <Footer onClose={onClose} onSave={() => void save()} busy={busy} />
    </Modal>
  );
}

// ───────────────────────── Помещение ─────────────────────────

export function LotModal({ supabase, lot, onClose, onSaved }: { supabase: Supabase; lot: VProperty | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    lot_number: lot?.lot_number ?? "",
    kind: lot?.kind ?? "Склад",
    surface_m2: lot?.surface_m2 != null ? String(lot.surface_m2) : "",
    list_rent: lot?.list_rent != null ? String(lot.list_rent) : "",
    address: lot?.address ?? "590 chemin d'Engoudes, 31450 Baziège",
    notes: lot?.notes ?? "",
    occupant: lot?.occupant ?? "",
    pays_cash: lot?.pays_cash ?? false,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.lot_number.trim()) return toast.error("Укажите номер");
    setBusy(true);
    const row = {
      lot_number: f.lot_number.trim(),
      label: `Помещение ${f.lot_number.trim()}`,
      kind: f.kind.trim() || "Склад",
      surface_m2: numOrNull(f.surface_m2),
      list_rent: numOrNull(f.list_rent),
      address: textOrNull(f.address),
      notes: textOrNull(f.notes),
      occupant: textOrNull(f.occupant),
      pays_cash: f.pays_cash,
    };
    const q = lot ? supabase.from("voldis_properties").update(row).eq("id", lot.id) : supabase.from("voldis_properties").insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) return err(error);
    toast.success("Сохранено");
    onSaved();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={lot ? `Помещение ${lot.lot_number}` : "Новое помещение"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="" ru="Номер">
          <input className="input" value={f.lot_number} onChange={set("lot_number")} autoFocus />
        </Field>
        <Field label="" ru="Тип">
          <input className="input" value={f.kind} onChange={set("kind")} />
        </Field>
        <Field label="" ru="Площадь (м²)">
          <input className="input" inputMode="decimal" value={f.surface_m2} onChange={set("surface_m2")} />
        </Field>
        <Field label="" ru="Ориентир аренды в месяц (€)">
          <input className="input" inputMode="decimal" value={f.list_rent} onChange={set("list_rent")} />
        </Field>
        <Field label="" ru="Адрес" className="sm:col-span-2">
          <input className="input" value={f.address} onChange={set("address")} />
        </Field>
        <Field label="" ru="Живёт без договора" hint="Показывается на плане (например, Evgueni)" className="sm:col-span-2">
          <input className="input" value={f.occupant} onChange={set("occupant")} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-stone-600 sm:col-span-2">
          <input type="checkbox" checked={f.pays_cash} onChange={(e) => setF({ ...f, pays_cash: e.target.checked })} />
          Платит наличными (не через банк)
        </label>
        <Field label="" ru="Заметки" className="sm:col-span-2">
          <textarea className="input min-h-20" value={f.notes} onChange={set("notes")} />
        </Field>
      </div>
      <Footer onClose={onClose} onSave={() => void save()} busy={busy} />
    </Modal>
  );
}

// ───────────────────────── Договор ─────────────────────────

export function LeaseModal({
  supabase,
  lease,
  props,
  tenants,
  leases,
  docs,
  defaultPropertyId,
  defaultTenantId,
  onClose,
  onSaved,
}: {
  supabase: Supabase;
  lease: VLease | null;
  props: VProperty[];
  tenants: VTenant[];
  leases: VLease[];
  docs: VDocument[];
  defaultPropertyId?: string;
  defaultTenantId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detailed = lease ? lease.rent_ht != null : true;
  const rate0 = lease && lease.rent_ht ? Math.round((num(lease.vat) / num(lease.rent_ht)) * 100) : 20;
  const [f, setF] = useState({
    property_id: lease?.property_id ?? defaultPropertyId ?? "",
    tenant_id: lease?.tenant_id ?? defaultTenantId ?? "",
    start_date: lease?.start_date ?? todayIso(),
    end_date: lease?.end_date ?? "",
    detailed,
    rent_ht: lease?.rent_ht != null ? String(lease.rent_ht) : "",
    vat_rate: String(rate0),
    charges: lease?.charges != null ? String(lease.charges) : "",
    total: lease ? String(lease.monthly_total) : "",
    deposit: lease ? String(lease.deposit) : "",
    billing_day: lease ? String(lease.billing_day) : "1",
    index_type: lease?.index_type ?? "none",
    next_revision_date: lease?.next_revision_date ?? "",
    notice_months: lease?.notice_months != null ? String(lease.notice_months) : "",
    notes: lease?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [newTenant, setNewTenant] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const computed = useMemo(() => {
    if (!f.detailed) return { ht: null as number | null, vat: null as number | null, charges: null as number | null, total: num(f.total) };
    const ht = num(f.rent_ht);
    const vat = round2((ht * num(f.vat_rate)) / 100);
    const charges = num(f.charges);
    return { ht, vat, charges, total: round2(ht + vat + charges) };
  }, [f]);

  const takenLots = new Set(leases.filter((l) => l.is_active && l.id !== lease?.id).map((l) => l.property_id));

  async function save() {
    if (!f.property_id || !f.tenant_id) return toast.error("Выберите помещение и арендатора");
    if (!f.start_date) return toast.error("Укажите дату начала");
    if (computed.total <= 0) return toast.error("Укажите сумму в месяц");
    setBusy(true);
    const row = {
      property_id: f.property_id,
      tenant_id: f.tenant_id,
      start_date: f.start_date,
      end_date: textOrNull(f.end_date),
      rent_ht: computed.ht,
      vat: computed.vat,
      charges: computed.charges,
      monthly_total: computed.total,
      deposit: num(f.deposit),
      billing_day: Math.min(28, Math.max(1, Number(f.billing_day) || 1)),
      index_type: f.index_type as VLease["index_type"],
      next_revision_date: textOrNull(f.next_revision_date),
      notice_months: numOrNull(f.notice_months),
      notes: textOrNull(f.notes),
    };
    const q = lease ? supabase.from("voldis_leases").update(row).eq("id", lease.id) : supabase.from("voldis_leases").insert({ ...row, is_active: true });
    const { error } = await q;
    if (error) {
      setBusy(false);
      return err(error);
    }
    if (!lease) await supabase.from("voldis_properties").update({ status: "rented" }).eq("id", f.property_id);
    setBusy(false);
    toast.success(lease ? "Сохранено" : "Договор создан: платежи появятся автоматически");
    onSaved();
    onClose();
  }

  async function terminate() {
    if (!lease) return;
    const when = window.prompt("Дата окончания договора (ГГГГ-ММ-ДД):", todayIso());
    if (!when || !/^\d{4}-\d{2}-\d{2}$/.test(when)) return;
    if (!window.confirm(`Завершить договор ${frDate(when)}? Платежи после этой даты ожидаться не будут.`)) return;
    const { error } = await supabase.from("voldis_leases").update({ is_active: false, terminated_on: when, end_date: when }).eq("id", lease.id);
    if (error) return err(error);
    const stillRented = leases.some((l) => l.is_active && l.id !== lease.id && l.property_id === lease.property_id);
    if (!stillRented) await supabase.from("voldis_properties").update({ status: "available" }).eq("id", lease.property_id);
    toast.success("Договор завершён");
    onSaved();
    onClose();
  }

  return (
    <>
      <Modal open onClose={onClose} title={lease ? "Договор" : "Новый договор"} width="max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="" ru="Помещение">
            <select className="input" value={f.property_id} onChange={set("property_id")}>
              <option value="">-</option>
              {props.map((p) => (
                <option key={p.id} value={p.id} disabled={takenLots.has(p.id)}>
                  Помещение {p.lot_number}, {num(p.surface_m2)} м²{takenLots.has(p.id) ? " (занято)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="" ru="Арендатор">
            <select className="input" value={f.tenant_id} onChange={(e) => (e.target.value === "__new" ? setNewTenant(true) : setF({ ...f, tenant_id: e.target.value }))}>
              <option value="">-</option>
              {tenants.filter((t) => t.is_active || t.id === f.tenant_id).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="__new">+ Новый арендатор...</option>
            </select>
          </Field>
          <Field label="" ru="Начало">
            <input className="input" type="date" value={f.start_date} onChange={set("start_date")} />
          </Field>
          <Field label="" ru="Окончание" hint="Оставьте пустым, если срок не ограничен">
            <input className="input" type="date" value={f.end_date} onChange={set("end_date")} />
          </Field>
        </div>

        <div className="mt-5 rounded-xl bg-stone-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-stone-700">Аренда в месяц</p>
            <label className="flex items-center gap-2 text-xs text-stone-500">
              <input type="checkbox" checked={!f.detailed} onChange={(e) => setF({ ...f, detailed: !e.target.checked })} />
              Одна общая сумма, без разбивки на НДС
            </label>
          </div>
          {f.detailed ? (
            <div className="grid grid-cols-3 gap-3">
              <Field label="" ru="Аренда без НДС (€)">
                <input className="input" inputMode="decimal" value={f.rent_ht} onChange={set("rent_ht")} />
              </Field>
              <Field label="" ru="НДС (%)">
                <input className="input" inputMode="decimal" value={f.vat_rate} onChange={set("vat_rate")} />
              </Field>
              <Field label="" ru="Расходы (€)">
                <input className="input" inputMode="decimal" value={f.charges} onChange={set("charges")} />
              </Field>
            </div>
          ) : (
            <Field label="" ru="Всего в месяц (€)">
              <input className="input" inputMode="decimal" value={f.total} onChange={set("total")} />
            </Field>
          )}
          <p className="mt-3 text-right text-sm text-stone-500">
            К оплате каждый месяц: <strong className="text-lg text-stone-900">{eur(computed.total)}</strong>
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="" ru="Депозит (€)">
            <input className="input" inputMode="decimal" value={f.deposit} onChange={set("deposit")} />
          </Field>
          <Field label="" ru="День платежа в месяце">
            <input className="input" inputMode="numeric" value={f.billing_day} onChange={set("billing_day")} />
          </Field>
          <Field label="" ru="Срок уведомления (мес.)">
            <input className="input" inputMode="numeric" value={f.notice_months} onChange={set("notice_months")} />
          </Field>
          <Field label="" ru="Индекс пересмотра">
            <select className="input" value={f.index_type} onChange={set("index_type")}>
              <option value="none">Нет</option>
              <option value="ILC">ILC</option>
              <option value="ILAT">ILAT</option>
              <option value="IRL">IRL</option>
            </select>
          </Field>
          <Field label="" ru="Следующий пересмотр" className="sm:col-span-2">
            <input className="input" type="date" value={f.next_revision_date} onChange={set("next_revision_date")} />
          </Field>
          <Field label="" ru="Заметки" className="sm:col-span-3">
            <textarea className="input min-h-16" value={f.notes} onChange={set("notes")} />
          </Field>
        </div>

        {lease && (
          <div className="mt-6 border-t border-stone-100 pt-5">
            <DocumentsPanel supabase={supabase} docs={docs} leaseId={lease.id} tenantId={lease.tenant_id} propertyId={lease.property_id} defaultKind="contract" onChanged={onSaved} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            {lease && lease.is_active && (
              <button className="text-sm font-semibold text-red-600 hover:underline" onClick={() => void terminate()}>
                Завершить договор
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              Сохранить
            </button>
          </div>
        </div>
      </Modal>
      {newTenant && (
        <TenantModal
          supabase={supabase}
          tenant={null}
          onClose={() => setNewTenant(false)}
          onSaved={(t) => {
            setF((prev) => ({ ...prev, tenant_id: t.id }));
            onSaved();
          }}
        />
      )}
    </>
  );
}

// ───────────────────────── Разовый платёж ─────────────────────────

export function ChargeModal({
  supabase,
  tenants,
  leases,
  props,
  defaultTenantId,
  defaultMonth,
  onClose,
  onSaved,
}: {
  supabase: Supabase;
  tenants: VTenant[];
  leases: VLease[];
  props: VProperty[];
  defaultTenantId?: string;
  defaultMonth: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    tenant_id: defaultTenantId ?? "",
    kind: "deposit" as VCharge["kind"],
    due_date: `${defaultMonth}-01`,
    amount_due: "",
    vat_amount: "",
    description: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const tenantLeases = leases.filter((l) => l.tenant_id === f.tenant_id && l.is_active);

  async function save() {
    if (!f.tenant_id) return toast.error("Выберите арендатора");
    const amount = num(f.amount_due);
    if (amount <= 0) return toast.error("Укажите сумму");
    setBusy(true);
    const lease = tenantLeases[0] ?? null;
    const row = {
      tenant_id: f.tenant_id,
      lease_id: lease?.id ?? null,
      property_id: lease?.property_id ?? props[0]?.id ?? null,
      kind: f.kind,
      due_date: f.due_date,
      amount_due: amount,
      vat_amount: num(f.vat_amount),
      amount_paid: 0,
      status: "unpaid",
      description: textOrNull(f.description) ?? (f.kind === "deposit" ? "Депозит" : null),
    };
    const { error } = await supabase.from("voldis_charges").insert(row);
    setBusy(false);
    if (error) return err(error);
    toast.success("Платёж добавлен");
    onSaved();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Разовый платёж">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="" ru="Арендатор" className="sm:col-span-2">
          <select className="input" value={f.tenant_id} onChange={set("tenant_id")}>
            <option value="">-</option>
            {tenants.filter((t) => t.is_active).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="" ru="Тип">
          <select className="input" value={f.kind} onChange={set("kind")}>
            <option value="deposit">Депозит</option>
            <option value="other">Другое</option>
            <option value="rent">Аренда (вне договора)</option>
          </select>
        </Field>
        <Field label="" ru="Срок">
          <input className="input" type="date" value={f.due_date} onChange={set("due_date")} />
        </Field>
        <Field label="" ru="Сумма с НДС (€)">
          <input className="input" inputMode="decimal" value={f.amount_due} onChange={set("amount_due")} />
        </Field>
        <Field label="" ru="в том числе НДС (€)">
          <input className="input" inputMode="decimal" value={f.vat_amount} onChange={set("vat_amount")} />
        </Field>
        <Field label="" ru="Описание" className="sm:col-span-2">
          <input className="input" value={f.description} onChange={set("description")} />
        </Field>
      </div>
      <Footer onClose={onClose} onSave={() => void save()} busy={busy} saveLabel="Добавить" />
    </Modal>
  );
}

// ───────────────────────── Документы ─────────────────────────

const safeName = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);

export function DocumentsPanel({
  supabase,
  docs,
  tenantId,
  leaseId,
  propertyId,
  defaultKind = "other",
  onChanged,
}: {
  supabase: Supabase;
  docs: VDocument[];
  tenantId?: string | null;
  leaseId?: string | null;
  propertyId?: string | null;
  defaultKind?: VDocument["kind"];
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<VDocument["kind"]>(defaultKind);
  const [busy, setBusy] = useState(false);
  const mine = docs.filter((d) => (leaseId ? d.lease_id === leaseId : tenantId ? d.tenant_id === tenantId && !d.lease_id : false));

  async function upload(file: File) {
    setBusy(true);
    const path = `docs/${leaseId ?? tenantId}/${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`;
    const up = await supabase.storage.from("voldis-documents").upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setBusy(false);
      return err(up.error);
    }
    const { error } = await supabase.from("voldis_documents").insert({
      tenant_id: tenantId ?? null,
      lease_id: leaseId ?? null,
      property_id: propertyId ?? null,
      kind,
      title: file.name,
      storage_path: path,
      mime: file.type || null,
      size_bytes: file.size,
    });
    setBusy(false);
    if (error) {
      await supabase.storage.from("voldis-documents").remove([path]);
      return err(error);
    }
    toast.success("Документ добавлен");
    onChanged();
  }

  async function open(d: VDocument) {
    const { data, error } = await supabase.storage.from("voldis-documents").createSignedUrl(d.storage_path, 120);
    if (error || !data) return toast.error("Не удалось открыть файл");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(d: VDocument) {
    if (!window.confirm(`Удалить документ «${d.title}»?`)) return;
    await supabase.storage.from("voldis-documents").remove([d.storage_path]);
    const { error } = await supabase.from("voldis_documents").delete().eq("id", d.id);
    if (error) return err(error);
    onChanged();
  }

  return (
    <div>
      <p className="mb-2 text-sm font-bold text-stone-700">Документы</p>
      {mine.length === 0 ? (
        <p className="mb-3 text-sm text-stone-400">Документов пока нет</p>
      ) : (
        <ul className="mb-3 divide-y divide-stone-100">
          {mine.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
              <button className="min-w-0 flex-1 truncate text-left font-medium text-primary-700 hover:underline" onClick={() => void open(d)}>
                {d.title}
              </button>
              <span className="shrink-0 text-xs text-stone-400">
                {DOCUMENT_KIND_LABEL[d.kind].ru} · {frDate(d.uploaded_at)}
              </span>
              <button className="shrink-0 text-stone-300 hover:text-red-600" onClick={() => void remove(d)} aria-label="Удалить">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as VDocument["kind"])}>
          {(Object.keys(DOCUMENT_KIND_LABEL) as VDocument["kind"][]).map((k) => (
            <option key={k} value={k}>
              {DOCUMENT_KIND_LABEL[k].ru}
            </option>
          ))}
        </select>
        <label className={`btn btn-secondary cursor-pointer ${busy ? "opacity-60" : ""}`}>
          {busy ? "Загрузка..." : "Добавить файл"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}
