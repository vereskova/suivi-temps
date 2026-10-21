"use client";

import { useState } from "react";
import type { Supabase } from "./data";
import { useVoldisData } from "./data";
import { Bi } from "./ui";
import Bank from "./tabs/Bank";
import Invoices from "./tabs/Invoices";
import Leases from "./tabs/Leases";
import Lots from "./tabs/Lots";
import Overview from "./tabs/Overview";
import Rents from "./tabs/Rents";
import Settings from "./tabs/Settings";
import Tenants from "./tabs/Tenants";

type Tab = "apercu" | "loyers" | "locataires" | "lots" | "baux" | "factures" | "banque" | "reglages";

const TABS: { key: Tab; fr: string; ru: string }[] = [
  { key: "apercu", fr: "Aperçu", ru: "Обзор" },
  { key: "loyers", fr: "Loyers", ru: "Платежи" },
  { key: "locataires", fr: "Locataires", ru: "Арендаторы" },
  { key: "lots", fr: "Lots", ru: "Помещения" },
  { key: "baux", fr: "Baux", ru: "Договоры" },
  { key: "factures", fr: "Factures", ru: "Счета" },
  { key: "banque", fr: "Banque", ru: "Банк" },
  { key: "reglages", fr: "Réglages", ru: "Настройки" },
];

const STORAGE_KEY = "voldis_tab";

export default function LocationView({ supabase }: { supabase: Supabase }) {
  const data = useVoldisData(supabase);
  const [tab, setTabState] = useState<Tab>(() => {
    if (typeof window === "undefined") return "apercu";
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Tab | null;
      return saved && TABS.some((t) => t.key === saved) ? saved : "apercu";
    } catch {
      return "apercu";
    }
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* stockage indisponible : l'onglet n'est simplement pas mémorisé */
    }
  };

  if (data.missing) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <p className="font-bold text-stone-800">VOLDIS — Аренда локалей</p>
        <p className="mt-2 text-sm text-stone-600">
          Таблицы ещё не созданы. Нужно выполнить миграции <code>0115</code>–<code>0118</code> в Supabase SQL editor.
        </p>
      </div>
    );
  }

  return (
    <div>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-stone-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px shrink-0 border-b-2 px-3.5 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
              tab === t.key ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-700"
            }`}
          >
            <Bi fr={t.fr} ru={t.ru} />
          </button>
        ))}
      </nav>
      {data.loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Chargement… / Загрузка…</div>
      ) : (
        <>
          {tab === "apercu" && <Overview supabase={supabase} data={data} go={setTab} />}
          {tab === "loyers" && <Rents supabase={supabase} data={data} />}
          {tab === "locataires" && <Tenants supabase={supabase} data={data} />}
          {tab === "lots" && <Lots supabase={supabase} data={data} />}
          {tab === "baux" && <Leases supabase={supabase} data={data} />}
          {tab === "factures" && <Invoices supabase={supabase} data={data} />}
          {tab === "banque" && <Bank supabase={supabase} data={data} />}
          {tab === "reglages" && <Settings supabase={supabase} data={data} />}
        </>
      )}
    </div>
  );
}
