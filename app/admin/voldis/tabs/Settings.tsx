"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import type { VSettings } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { Bi, Field } from "../ui";

export default function Settings({ supabase, data }: { supabase: Supabase; data: VoldisData }) {
  const { settings, reload } = data;
  const [f, setF] = useState<Partial<VSettings>>(settings ?? {});
  const [mail, setMail] = useState<boolean | null>(null);
  const [sender, setSender] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (error) return toast.error("Erreur : " + error.message);
    toast.success("Enregistré / Сохранено");
    await reload();
  }

  if (!settings) {
    return <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">Les réglages ne sont pas encore disponibles : exécutez la migration 0118.</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className={`mb-6 rounded-2xl px-4 py-3 text-sm ${mail ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {mail === null
          ? "Vérification de l'envoi d'e-mails…"
          : mail
          ? `Envoi d'e-mails configuré depuis ${sender ?? "la boîte OVH"} (nom affiché : ${settings?.company_name ?? "VOLDIS"}). Les réponses arrivent à l'e-mail ci-dessous. / Отправка почты настроена.`
          : "Envoi d'e-mails non configuré : la boîte OVH du projet est introuvable sur le serveur (OVH_EMAIL_ADDRESS, OVH_EMAIL_PASSWORD, OVH_IMAP_HOST). Les PDF restent téléchargeables. / Отправка почты не настроена."}
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <p className="mb-4 text-sm font-bold text-stone-700">
          <Bi fr="Société (apparaît sur les factures)" ru="Компания (данные в счетах)" />
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" ru="Название">
            <input className="input" value={val("company_name")} onChange={set("company_name")} />
          </Field>
          <Field label="Forme juridique" ru="Форма">
            <input className="input" value={val("legal_form")} onChange={set("legal_form")} />
          </Field>
          <Field label="SIREN">
            <input className="input" value={val("siren")} onChange={set("siren")} />
          </Field>
          <Field label="N° de TVA" ru="Номер НДС">
            <input className="input" value={val("vat_number")} onChange={set("vat_number")} />
          </Field>
          <Field label="Adresse" ru="Адрес" className="sm:col-span-2">
            <input className="input" value={val("address")} onChange={set("address")} />
          </Field>
          <Field label="IBAN">
            <input className="input" value={val("iban")} onChange={set("iban")} />
          </Field>
          <Field label="BIC">
            <input className="input" value={val("bic")} onChange={set("bic")} />
          </Field>
          <Field label="E-mail d'envoi des factures" ru="Почта отправителя" hint="Les réponses des locataires arriveront ici">
            <input className="input" type="email" value={val("email")} onChange={set("email")} />
          </Field>
          <Field label="Téléphone" ru="Телефон">
            <input className="input" value={val("phone")} onChange={set("phone")} />
          </Field>
          <Field label="Préfixe factures" ru="Префикс счетов">
            <input className="input" value={val("invoice_prefix")} onChange={set("invoice_prefix")} />
          </Field>
          <Field label="Préfixe quittances" ru="Префикс квитанций">
            <input className="input" value={val("receipt_prefix")} onChange={set("receipt_prefix")} />
          </Field>
          <Field label="Conditions de règlement" ru="Условия оплаты" className="sm:col-span-2">
            <input className="input" value={val("payment_terms")} onChange={set("payment_terms")} />
          </Field>
          <Field label="Mention de retard de paiement" ru="Пени за просрочку" className="sm:col-span-2">
            <textarea className="input min-h-20" value={val("late_penalty")} onChange={set("late_penalty")} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end">
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            <Bi fr="Enregistrer" ru="Сохранить" />
          </button>
        </div>
      </div>
    </div>
  );
}
