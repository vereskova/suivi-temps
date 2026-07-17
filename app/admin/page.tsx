"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
  teams: { name: string } | null;
};

type PointageRow = {
  employee_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  pause_minutes: number | null;
  overtime_minutes: number | null;
  is_absent: boolean;
  total_minutes: number | null;
  absence_types: { label: string } | null;
};

const WEEKDAYS_FR = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function today() {
  return new Date().toISOString().split("T")[0];
}

function fmtMinutes(min: number | null | undefined) {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = Math.abs(min % 60);
  return `${h}h${m.toString().padStart(2, "0")}`;
}

function employeeName(e: { first_name: string; last_name: string }) {
  return `${e.last_name} ${e.first_name}`.trim();
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const toISO = (d: Date) => d.toISOString().split("T")[0];
  return { start: toISO(start), end: toISO(end), daysInMonth: end.getUTCDate() };
}

export default function AdminPage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"jour" | "employe" | "mois">("jour");
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const admin = roleRow?.role === "rh_admin";
      setIsAdmin(admin);

      if (admin) {
        const { data } = await supabase
          .from("employees")
          .select(
            "id, first_name, last_name, team_id, teams!employees_team_id_fkey(name)"
          )
          .eq("category", "chantier")
          .eq("status", "active")
          .order("last_name");
        setEmployees((data as unknown as Employee[]) ?? []);
      }

      setLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 flex items-center justify-center">
        <p className="text-slate-400">Chargement…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 flex items-center justify-center">
        <div className="card max-w-sm text-center">
          <p className="font-bold">Accès réservé RH</p>
          <p className="text-sm text-slate-400 mt-2">Доступ только для RH.</p>
          <Link href="/" className="btn btn-dark mt-4 inline-block">
            Retour
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between mb-6">
          <h1 className="text-3xl font-black">
            Tableau de bord RH
            <span className="block text-sm text-slate-400 font-normal">
              Отчёты по часам
            </span>
          </h1>
          <Link href="/" className="text-xs text-slate-400 underline">
            Retour au pointage
          </Link>
        </div>

        <div className="flex gap-2 mb-6">
          <TabButton active={tab === "jour"} onClick={() => setTab("jour")}>
            Par jour
          </TabButton>
          <TabButton active={tab === "employe"} onClick={() => setTab("employe")}>
            Par employé
          </TabButton>
          <TabButton active={tab === "mois"} onClick={() => setTab("mois")}>
            Totaux du mois
          </TabButton>
        </div>

        {tab === "jour" && <JourView supabase={supabase} employees={employees} />}
        {tab === "employe" && (
          <EmployeView supabase={supabase} employees={employees} />
        )}
        {tab === "mois" && <MoisView supabase={supabase} employees={employees} />}
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

// ── Vue "Par jour" — remplace les onglets DATA/APP_DATA ─────────────────────
function JourView({
  supabase,
  employees,
}: {
  supabase: ReturnType<typeof createClient>;
  employees: Employee[];
}) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<PointageRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("pointage_entries")
        .select(
          "employee_id, work_date, start_time, end_time, pause_minutes, overtime_minutes, is_absent, total_minutes, absence_types(label)"
        )
        .eq("work_date", date);
      setRows((data as unknown as PointageRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [date, supabase]);

  const byEmployee = useMemo(() => {
    const map = new Map<string, PointageRow>();
    rows.forEach((r) => map.set(r.employee_id, r));
    return map;
  }, [rows]);

  const grouped = useMemo(() => {
    const teams = new Map<string, Employee[]>();
    employees.forEach((e) => {
      const teamName = e.teams?.name ?? "Sans équipe";
      if (!teams.has(teamName)) teams.set(teamName, []);
      teams.get(teamName)!.push(e);
    });
    return Array.from(teams.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [employees]);

  return (
    <div>
      <div className="card mb-4 max-w-xs">
        <label className="font-bold text-sm">
          Date
          <input
            type="date"
            className="input mt-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : (
        grouped.map(([teamName, members]) => (
          <div key={teamName} className="card mb-4 overflow-x-auto">
            <p className="font-bold mb-3">{teamName}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="pb-2 pr-4">Nom</th>
                  <th className="pb-2 pr-4">Début</th>
                  <th className="pb-2 pr-4">Fin</th>
                  <th className="pb-2 pr-4">Pause</th>
                  <th className="pb-2 pr-4">H. Supp</th>
                  <th className="pb-2 pr-4">Total</th>
                  <th className="pb-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {members.map((e) => {
                  const r = byEmployee.get(e.id);
                  return (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4 font-semibold">
                        {employeeName(e)}
                      </td>
                      {!r ? (
                        <td colSpan={5} className="py-2 text-slate-300 italic">
                          — non saisi —
                        </td>
                      ) : r.is_absent ? (
                        <td colSpan={5} className="py-2 text-red-600 font-semibold">
                          Absent{r.absence_types ? ` — ${r.absence_types.label}` : ""}
                        </td>
                      ) : (
                        <>
                          <td className="py-2 pr-4">{r.start_time ?? "—"}</td>
                          <td className="py-2 pr-4">{r.end_time ?? "—"}</td>
                          <td className="py-2 pr-4">
                            {fmtMinutes(r.pause_minutes)}
                          </td>
                          <td className="py-2 pr-4">
                            {fmtMinutes(r.overtime_minutes)}
                          </td>
                          <td className="py-2 pr-4 font-bold">
                            {fmtMinutes(r.total_minutes)}
                          </td>
                        </>
                      )}
                      {r && (
                        <td className="py-2 text-green-600 font-semibold">OK</td>
                      )}
                      {!r && <td className="py-2" />}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

// ── Vue "Par employé" — remplace l'onglet RAPPORT ───────────────────────────
function EmployeView({
  supabase,
  employees,
}: {
  supabase: ReturnType<typeof createClient>;
  employees: Employee[];
}) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<PointageRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      setLoading(true);
      const { start, end } = monthRange(year, month);
      const { data } = await supabase
        .from("pointage_entries")
        .select(
          "employee_id, work_date, start_time, end_time, pause_minutes, overtime_minutes, is_absent, total_minutes, absence_types(label)"
        )
        .eq("employee_id", employeeId)
        .gte("work_date", start)
        .lte("work_date", end)
        .order("work_date");
      setRows((data as unknown as PointageRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [employeeId, year, month, supabase]);

  const byDate = useMemo(() => {
    const map = new Map<string, PointageRow>();
    rows.forEach((r) => map.set(r.work_date, r));
    return map;
  }, [rows]);

  const { daysInMonth, start } = monthRange(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(start + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });

  const totalMinutes = rows.reduce((sum, r) => sum + (r.total_minutes ?? 0), 0);

  return (
    <div>
      <div className="card mb-4 flex flex-wrap gap-4 items-end">
        <label className="font-bold text-sm">
          Employé
          <select
            className="input mt-2"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">Sélectionner…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeName(e)} — {e.teams?.name ?? ""}
              </option>
            ))}
          </select>
        </label>

        <label className="font-bold text-sm">
          Mois
          <select
            className="input mt-2"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS_FR.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="font-bold text-sm">
          Année
          <input
            type="number"
            className="input mt-2"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
      </div>

      {!employeeId ? (
        <p className="text-slate-400">Sélectionnez un employé.</p>
      ) : loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-2 pr-4">Jour</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Début</th>
                <th className="pb-2 pr-4">Fin</th>
                <th className="pb-2 pr-4">Pause</th>
                <th className="pb-2 pr-4">H. Supp</th>
                <th className="pb-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const iso = d.toISOString().split("T")[0];
                const r = byDate.get(iso);
                const weekday = WEEKDAYS_FR[d.getUTCDay()];
                const isWeekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                return (
                  <tr
                    key={iso}
                    className={`border-t border-slate-100 ${
                      isWeekend ? "bg-slate-50" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-4 capitalize text-slate-500">
                      {weekday}
                    </td>
                    <td className="py-1.5 pr-4">{d.getUTCDate()}</td>
                    {!r ? (
                      <td colSpan={4} className="py-1.5 text-slate-300 italic">
                        —
                      </td>
                    ) : r.is_absent ? (
                      <td colSpan={4} className="py-1.5 text-red-600 font-semibold">
                        Absent{r.absence_types ? ` — ${r.absence_types.label}` : ""}
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 pr-4">{r.start_time ?? "—"}</td>
                        <td className="py-1.5 pr-4">{r.end_time ?? "—"}</td>
                        <td className="py-1.5 pr-4">
                          {fmtMinutes(r.pause_minutes)}
                        </td>
                        <td className="py-1.5 pr-4">
                          {fmtMinutes(r.overtime_minutes)}
                        </td>
                        <td className="py-1.5 font-bold">
                          {fmtMinutes(r.total_minutes)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td colSpan={6} className="pt-3 text-right font-bold">
                  Total du mois
                </td>
                <td className="pt-3 font-black">{fmtMinutes(totalMinutes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vue "Totaux du mois" — remplace l'onglet Heures totales ─────────────────
function MoisView({
  supabase,
  employees,
}: {
  supabase: ReturnType<typeof createClient>;
  employees: Employee[];
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<PointageRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { start, end } = monthRange(year, month);
      const { data } = await supabase
        .from("pointage_entries")
        .select("employee_id, total_minutes")
        .gte("work_date", start)
        .lte("work_date", end);
      setRows((data as unknown as PointageRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [year, month, supabase]);

  const totalsByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      map.set(
        r.employee_id,
        (map.get(r.employee_id) ?? 0) + (r.total_minutes ?? 0)
      );
    });
    return map;
  }, [rows]);

  const sorted = useMemo(
    () =>
      [...employees].sort((a, b) => {
        const teamA = a.teams?.name ?? "";
        const teamB = b.teams?.name ?? "";
        return teamA.localeCompare(teamB) || a.last_name.localeCompare(b.last_name);
      }),
    [employees]
  );

  return (
    <div>
      <div className="card mb-4 flex flex-wrap gap-4 items-end max-w-md">
        <label className="font-bold text-sm">
          Mois
          <select
            className="input mt-2"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS_FR.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="font-bold text-sm">
          Année
          <input
            type="number"
            className="input mt-2"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
      </div>

      {loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Équipe</th>
                <th className="pb-2 pr-4">Heures totales</th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const total = totalsByEmployee.get(e.id);
                return (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-semibold">
                      {employeeName(e)}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {e.teams?.name ?? "—"}
                    </td>
                    <td className="py-2 pr-4 font-bold">
                      {total ? fmtMinutes(total) : "—"}
                    </td>
                    <td
                      className={`py-2 font-semibold ${
                        total ? "text-green-600" : "text-slate-300"
                      }`}
                    >
                      {total ? "OK" : "Aucune donnée"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
