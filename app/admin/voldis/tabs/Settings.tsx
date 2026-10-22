"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { remaining, round2, type VSettings, type VTenant } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { TenantModal } from "../forms";
import { Field, eur } from "../ui";

export default function Settings({ supabase, data }: { supabase: Supabase; data: VoldisData }) {
  const { settings, tenants, leases, charges, reload } = data;
  const [f, setF] = useState<Partial<VSettings>>(settings ?? {});
  const [mail, setMail] = useState<boolean | null>(null);
  const [sender, setSender] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<VTenant | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetch("/api/voldis/mail-status")
      .then((r) => r.json())
      .then((j) => {
        setMail(!!j.configured);
        setSender(j.sender ?? null);
      })
      .catch(() => setMail(false));
  }, []);

  const set = (k: keyof VSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const val = (k: keyof VSettings) => (f[k] as string | null | undefined) ?? "";

  async function save() {
    setBusy(true);
    const clean = (k: keyof VSettings) => (val(k).trim() === "" ? null : val(k).trim());
    const { error } = await supabase.from("voldis_settings").upsert({
      id: 1,
      company_name: val("company_name").trim() || "VOLDIS",
      legal_form: clean("legal_form"),
      siren: clean("siren"),
      vat_number: clean("vat_number"),
      address: clean("address"),
      iban: clean("iban"),
      bic: clean("bic"),
      email: clean("email"),
      phone: clean("phone"),
      payment_terms: val("payment_terms").trim() || "Paiement à réception, par virement.",
      late_penalty: val("late_penalty").trim(),
      invoice_prefix: val("invoice_prefix").trim() || "F",
      receipt_prefix: val("receipt_prefix").trim() || "Q",
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) return toast.error("Ошибка: " + error.message);
    toast.success("Сохранено");
    await reload();
  }

  const debt = (id: string) => round2(charges.filter((c) => c.tenant_id === id && c.kind === "rent" && c.status !== "lost").reduce((s, c) => s + remaining(c), 0));
  const rows = tenants.filter((t) => showArchived || t.is_active);

  return (
    <div className="grid max-w-4xl gap-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-stone-700">Арендаторы</p>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 text-stone-500">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Показать архив
            </label>
            <button className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing("new")}>
              + Арендатор
            </button>
          </div>
        </div>
        <ul className="divide-y divide-stone-100">
          {rows.map((t) => {
            const d = debt(t.id);
            const hasLease = leases.some((l) => l.tenant_id === t.id && l.is_active);
            return (
              <li key={t.id} className={`flex flex-wrap items-center gap-3 py-2.5 text-sm ${t.is_active ? "" : "opacity-50"}`}>
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                  <span className="font-semibold text-stone-800 hover:underline">{t.name}</span>
                  <span className="ml-2 text-xs text-stone-400">
                    {[t.email, t.phone].filter(Boolean).join(" · ") || "нет контактов"}
                    {!hasLease && t.is_active ? " · без договора" : ""}
                  </span>
                </button>
                {d > 0 && <span className="text-xs font-semibold tabular-nums text-red-600">долг {eur(d)}</span>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-stone-400">Договор оформляется в карточке помещения (вкладка «План»).</p>
      </section>

      <section>
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${mail ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {mail === null
            ? "Проверка отправки почты..."
            : mail
            ? `Отправка почты настроена: письма уходят с ${sender ?? "рабочего ящика"} под именем «${settings?.company_name ?? "VOLDIS"}». Ответы приходят на адрес из поля «Почта для ответов» ниже.`
            : "Отправка почты не настроена: не найден рабочий ящик OVH на сервере. PDF-счета можно скачивать."}
        </div>
        {!settings ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">Настройки недоступны: выполните миграцию 0118.</div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <p className="mb-1 text-sm font-bold text-stone-700">Данные компании для счетов</p>
            <p className="mb-4 text-xs text-stone-400">Эти данные печатаются в счетах и квитанциях (они остаются по-французски).</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="" ru="Название">
                <input className="input" value={val("company_name")} onChange={set("company_name")} />
              </Field>
              <Field label="" ru="Форма компании">
                <input className="input" value={val("legal_form")} onChange={set("legal_form")} />
              </Field>
              <Field label="" ru="SIREN">
                <input className="input" value={val("siren")} onChange={set("siren")} />
              </Field>
              <Field label="" ru="Номер НДС" hint="Оставьте пустым, пока бухгалтер не подтвердил">
                <input className="input" value={val("vat_number")} onChange={set("vat_number")} />
              </Field>
              <Field label="" ru="Адрес" className="sm:col-span-2">
                <input className="input" value={val("address")} onChange={set("address")} />
              </Field>
              <Field label="" ru="IBAN">
                <input className="input" value={val("iban")} onChange={set("iban")} />
              </Field>
              <Field label="" ru="BIC">
                <input className="input" value={val("bic")} onChange={set("bic")} />
              </Field>
              <Field label="" ru="Почта для ответов" hint="Сюда приходят ответы арендаторов на счета и напоминания">
                <input className="input" type="email" value={val("email")} onChange={set("email")} />
              </Field>
              <Field label="" ru="Телефон">
                <input className="input" value={val("phone")} onChange={set("phone")} />
              </Field>
              <Field label="" ru="Префикс счетов">
                <input className="input" value={val("invoice_prefix")} onChange={set("invoice_prefix")} />
              </Field>
              <Field label="" ru="Префикс квитанций">
                <input className="input" value={val("receipt_prefix")} onChange={set("receipt_prefix")} />
              </Field>
              <Field label="" ru="Условия оплаты (в счёте)" className="sm:col-span-2">
                <input className="input" value={val("payment_terms")} onChange={set("payment_terms")} />
              </Field>
              <Field label="" ru="Пени за просрочку (в счёте)" className="sm:col-span-2">
                <textarea className="input min-h-20" value={val("late_penalty")} onChange={set("late_penalty")} />
              </Field>
            </div>
            <div className="mt-6 flex justify-end">
              <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
                Сохранить
              </button>
            </div>
          </div>
        )}
      </section>

      {editing && <TenantModal supabase={supabase} tenant={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </div>
  );
}
