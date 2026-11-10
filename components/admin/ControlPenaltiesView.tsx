"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Журнал штрафов контролёра (таблица control_penalties). Читается напрямую под RLS,
// отмена - через /api/controle/penalties/cancel (только rh_admin).

type Row = {
  id: string;
  batch_id: string;
  created_at: string;
  inspection_date: string;
  site: string;
  catalog_code: string | null;
  stage: string;
  description: string;
  unit: string;
  qty: number;
  team_amount: number;
  divisor: number;
  share_each: number;
  note: string | null;
  photo_paths: string[] | null;
  created_by_email: string;
  status: "active" | "cancelled";
  cancel_reason: string | null;
  teams: { name: string } | null;
  control_penalty_targets: { employee_id: string; share: number }[];
};

const eur = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2).replace(".", ",")} €`;
const fr = (iso: string) => iso.split("-").reverse().join("/");

export default function ControlPenaltiesView({ supabase, canCancel }: { supabase: SupabaseClient; canCancel: boolean }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [team, setTeam] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const from = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const to = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const { data, error: err } = await supabase
      .from("control_penalties")
      .select(
        "id, batch_id, created_at, inspection_date, site, catalog_code, stage, description, unit, qty, team_amount, divisor, share_each, note, photo_paths, created_by_email, status, cancel_reason, teams(name), control_penalty_targets(employee_id, share)"
      )
      .gte("inspection_date", from)
      .lt("inspection_date", to)
      .order("inspection_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else {
      setError(null);
      setRows((data ?? []) as unknown as Row[]);
      const ids = Array.from(new Set((data ?? []).flatMap((r) => (r as unknown as Row).control_penalty_targets.map((t) => t.employee_id))));
      if (ids.length) {
        const { data: emps } = await supabase.from("employees").select("id, first_name, last_name").in("id", ids);
        setNames(Object.fromEntries((emps ?? []).map((e) => [e.id as string, `${String(e.last_name).toUpperCase()} ${e.first_name}`])));
      }
    }
    setLoading(false);
  }, [supabase, month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const teamOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.teams?.name).filter(Boolean) as string[])).sort(), [rows]);
  const shown = rows.filter((r) => (showCancelled || r.status === "active") && (!team || r.teams?.name === team));
  const active = shown.filter((r) => r.status === "active");
  const totalTeam = active.reduce((s, r) => s + Number(r.team_amount), 0);

  async function cancelBatch(batchId: string) {
    const reason = window.prompt("Причина отмены (необязательно):");
    if (reason === null) return;
    const res = await fetch("/api/controle/penalties/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId, reason }),
    });
    if (!res.ok) window.alert(((await res.json()) as { error?: string }).error ?? "Ошибка");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-stone-500">
          Месяц
          <input type="month" className="input mt-1" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="text-xs font-bold text-stone-500">
          Бригада
          <select className="input mt-1" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Все</option>
            {teamOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs font-bold text-stone-500">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> показать отменённые
        </label>
        <p className="ml-auto pb-2 text-sm font-extrabold text-stone-700">
          {active.length} записей · на команды {eur(totalTeam)}
        </p>
      </div>

      {error && <p className="rounded-xl bg-error-50 px-3 py-2 text-sm font-bold text-error-600">{error}</p>}
      {loading && <p className="text-sm text-stone-400">Загрузка…</p>}
      {!loading && shown.length === 0 && <p className="text-sm text-stone-400">За этот месяц штрафов нет.</p>}

      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-stone-100 bg-white shadow-sm">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-stone-50 text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2">Объект</th>
                <th className="px-3 py-2">Команда</th>
                <th className="px-3 py-2">Пункт</th>
                <th className="px-3 py-2 text-right">Кол-во</th>
                <th className="px-3 py-2 text-right">На команду</th>
                <th className="px-3 py-2 text-right">На человека</th>
                <th className="px-3 py-2">Кому</th>
                <th className="px-3 py-2">Контролёр</th>
                <th className="px-3 py-2">Фото</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`border-t border-stone-100 align-top ${r.status === "cancelled" ? "opacity-50 line-through" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold">{fr(r.inspection_date)}</td>
                  <td className="px-3 py-2">{r.site}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.teams?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="font-bold">{r.catalog_code ? `${r.catalog_code} ${r.stage}` : r.stage}</span>
                    <span className="block text-xs text-stone-500">{r.description}</span>
                    {r.note && <span className="block text-xs italic text-stone-400">{r.note}</span>}
                    {r.status === "cancelled" && r.cancel_reason && <span className="block text-xs no-underline">Отмена: {r.cancel_reason}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.unit === "per_piece" || r.unit === "per_day" ? r.qty : ""}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{eur(Number(r.team_amount))}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.catalog_code ? `${eur(Number(r.share_each))} (÷${r.divisor})` : ""}</td>
                  <td className="px-3 py-2 text-xs">{r.control_penalty_targets.map((t) => names[t.employee_id] ?? "…").join(", ")}</td>
                  <td className="px-3 py-2 text-xs text-stone-500">{r.created_by_email}</td>
                  <td className="px-3 py-2 text-xs">
                    {(r.photo_paths ?? []).map((p, i) => (
                      <a key={p} href={`/api/controle/photo?path=${encodeURIComponent(p)}`} target="_blank" rel="noreferrer" className="mr-1 font-bold text-primary-700 underline">
                        {i + 1}
                      </a>
                    ))}
                  </td>
                  <td className="px-3 py-2">
                    {canCancel && r.status === "active" && (
                      <button onClick={() => cancelBatch(r.batch_id)} className="text-xs font-bold text-error-600">
                        Отменить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-stone-400">
        Каждая запись автоматически попадает в Primes &amp; Bonus (штраф + причина с датой и объектом) у отмеченных сотрудников.
      </p>
    </div>
  );
}
