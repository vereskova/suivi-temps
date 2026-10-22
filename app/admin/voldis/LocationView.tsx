"use client";

import { useState } from "react";
import type { Supabase } from "./data";
import { useVoldisData } from "./data";
import Bank from "./tabs/Bank";
import Month from "./tabs/Month";
import Plan from "./tabs/Plan";
import Settings from "./tabs/Settings";
import LotCard from "./LotCard";

type Tab = "plan" | "mois" | "banque" | "reglages";

const TABS: { key: Tab; label: string }[] = [
  { key: "plan", label: "План" },
  { key: "mois", label: "Месяц" },
  { key: "banque", label: "Банк" },
  { key: "reglages", label: "Настройки" },
];

const STORAGE_KEY = "voldis_tab2";

export default function LocationView({ supabase }: { supabase: Supabase }) {
  const data = useVoldisData(supabase);
  const [tab, setTabState] = useState<Tab>(() => {
    if (typeof window === "undefined") return "plan";
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Tab | null;
      return saved && TABS.some((t) => t.key === saved) ? saved : "plan";
    } catch {
      return "plan";
    }
  });
  const [lotFromMonth, setLotFromMonth] = useState<string | null>(null);
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* хранилище недоступно: вкладка просто не запоминается */
    }
  };

  if (data.missing) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <p className="font-bold text-stone-800">VOLDIS: аренда помещений</p>
        <p className="mt-2 text-sm text-stone-600">
          Таблицы ещё не созданы. Нужно выполнить миграции <code>0115</code> - <code>0121</code> в Supabase SQL editor.
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
            className={`-mb-px shrink-0 border-b-2 px-4 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
              tab === t.key ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {data.loading ? (
        <div className="py-16 text-center text-sm text-stone-400">Загрузка...</div>
      ) : (
        <>
          {tab === "plan" && <Plan supabase={supabase} data={data} go={setTab} />}
          {tab === "mois" && <Month supabase={supabase} data={data} onOpenLot={setLotFromMonth} />}
          {tab === "banque" && <Bank supabase={supabase} data={data} />}
          {tab === "reglages" && <Settings supabase={supabase} data={data} />}
          {lotFromMonth && <LotCard supabase={supabase} data={data} lotId={lotFromMonth} onClose={() => setLotFromMonth(null)} />}
        </>
      )}
    </div>
  );
}
