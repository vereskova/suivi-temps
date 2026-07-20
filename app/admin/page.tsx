"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { formatLive, normalizeTime, timeToMinutes, minutesToHHMM } from "@/lib/time";

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
  teams: { name: string } | null;
};

type EmployeeStatus = "active" | "on_leave" | "terminated";

type EmployeeFull = Employee & {
  status: EmployeeStatus;
  category: "chantier" | "bureau";
  hire_date: string | null;
  end_date: string | null;
};

type Team = { id: string; name: string };

type AbsenceType = { id: string; code: string; label: string };

type PointageRow = {
  employee_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  pause_minutes: number | null;
  overtime_minutes: number | null;
  is_absent: boolean;
  total_minutes: number | null;
  absence_type_id?: string | null;
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

const POINTAGE_SELECT =
  "employee_id, work_date, start_time, end_time, pause_minutes, overtime_minutes, is_absent, absence_type_id, total_minutes, absence_types(label)";

type ViewKey =
  | "jour"
  | "employe"
  | "mois"
  | "export"
  | "effectif"
  | "medical"
  | "formations"
  | "tailles";

const NAV_ITEMS: { key: ViewKey; label: string }[] = [
  { key: "jour", label: "Par jour" },
  { key: "employe", label: "Par employé" },
  { key: "mois", label: "Totaux du mois" },
  { key: "export", label: "Export / Import" },
];

export default function AdminPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [view, setView] = useState<ViewKey>("jour");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  async function loadActiveEmployees() {
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
        const [, { data: absenceRows }, { data: teamRows }] = await Promise.all([
          loadActiveEmployees(),
          supabase.from("absence_types").select("id, code, label").order("label"),
          supabase.from("teams").select("id, name").eq("active", true).order("name"),
        ]);
        setAbsenceTypes(absenceRows ?? []);
        setTeams(teamRows ?? []);
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
      <div className="mx-auto max-w-6xl">
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

        <div className="flex gap-6 items-start">
          <aside className="w-56 shrink-0">
            <nav className="card p-3 space-y-4 sticky top-4">
              <SidebarSection title="Pointage">
                {NAV_ITEMS.map((item) => (
                  <SidebarLink
                    key={item.key}
                    active={view === item.key}
                    onClick={() => setView(item.key)}
                  >
                    {item.label}
                  </SidebarLink>
                ))}
              </SidebarSection>

              <SidebarSection title="Effectif">
                <SidebarLink
                  active={view === "effectif"}
                  onClick={() => setView("effectif")}
                >
                  Employés
                </SidebarLink>
                <SidebarLink
                  active={view === "medical"}
                  onClick={() => setView("medical")}
                >
                  Médical
                </SidebarLink>
                <SidebarLink
                  active={view === "formations"}
                  onClick={() => setView("formations")}
                >
                  Formations
                </SidebarLink>
                <SidebarLink
                  active={view === "tailles"}
                  onClick={() => setView("tailles")}
                >
                  Tailles
                </SidebarLink>
              </SidebarSection>

              <SidebarSection title="À venir">
                <SidebarLink disabled>Dossier salarié</SidebarLink>
                <SidebarLink disabled>Paie</SidebarLink>
              </SidebarSection>
            </nav>
          </aside>

          <div className="flex-1 min-w-0">
            {view === "jour" && (
              <JourView
                supabase={supabase}
                employees={employees}
                absenceTypes={absenceTypes}
              />
            )}
            {view === "employe" && (
              <EmployeView supabase={supabase} employees={employees} />
            )}
            {view === "mois" && (
              <MoisView supabase={supabase} employees={employees} />
            )}
            {view === "export" && (
              <ExportImportView
                supabase={supabase}
                employees={employees}
                absenceTypes={absenceTypes}
              />
            )}
            {view === "effectif" && (
              <EmployeesView
                supabase={supabase}
                teams={teams}
                onChanged={loadActiveEmployees}
              />
            )}
            {view === "medical" && <MedicalView supabase={supabase} />}
            {view === "formations" && <FormationsView supabase={supabase} />}
            {view === "tailles" && <TaillesView supabase={supabase} />}
          </div>
        </div>
      </div>
    </main>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SidebarLink({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-xl px-3 py-2 text-sm font-bold ${
        disabled
          ? "text-slate-300 cursor-not-allowed"
          : active
          ? "bg-slate-900 text-white"
          : "text-slate-500 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

// ── Vue "Par jour" — remplace les onglets DATA/APP_DATA, éditable ───────────
type EditForm = {
  start: string;
  end: string;
  pause: string;
  extra: string;
  absent: boolean;
  absenceTypeId: string;
};

function JourView({
  supabase,
  employees,
  absenceTypes,
}: {
  supabase: ReturnType<typeof createClient>;
  employees: Employee[];
  absenceTypes: AbsenceType[];
}) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<PointageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [teamFilter, setTeamFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setEditingId(null);
      setLoading(true);
      const { data } = await supabase
        .from("pointage_entries")
        .select(POINTAGE_SELECT)
        .eq("work_date", date);
      setRows((data as unknown as PointageRow[]) ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, refreshKey]);

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

  const teamOptions = useMemo(
    () => grouped.map(([teamName]) => teamName),
    [grouped]
  );

  const filteredGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grouped
      .filter(([teamName]) => teamFilter === "all" || teamName === teamFilter)
      .map(([teamName, members]) => [
        teamName,
        q ? members.filter((m) => employeeName(m).toLowerCase().includes(q)) : members,
      ] as [string, Employee[]])
      .filter(([, members]) => members.length > 0);
  }, [grouped, teamFilter, search]);

  function startEdit(e: Employee) {
    const r = byEmployee.get(e.id);
    setEditingId(e.id);
    setEditForm({
      start: minutesToHHMM(r && !r.is_absent ? timeStrToMinutes(r.start_time) : null),
      end: minutesToHHMM(r && !r.is_absent ? timeStrToMinutes(r.end_time) : null),
      pause: minutesToHHMM(r?.pause_minutes ?? null),
      extra: minutesToHHMM(r?.overtime_minutes ?? null),
      absent: r?.is_absent ?? false,
      absenceTypeId: r?.absence_type_id ?? "",
    });
  }

  async function saveEdit(e: Employee) {
    if (!editForm || !e.team_id) return;
    setSaving(true);

    const payload = {
      work_date: date,
      team_id: e.team_id,
      employee_id: e.id,
      start_time: editForm.absent || !editForm.start ? null : editForm.start,
      end_time: editForm.absent || !editForm.end ? null : editForm.end,
      pause_minutes: editForm.absent ? null : timeToMinutes(editForm.pause),
      overtime_minutes: editForm.absent ? null : timeToMinutes(editForm.extra),
      is_absent: editForm.absent,
      absence_type_id: editForm.absent && editForm.absenceTypeId ? editForm.absenceTypeId : null,
    };

    const { error } = await supabase
      .from("pointage_entries")
      .upsert(payload, { onConflict: "work_date,employee_id" });

    setSaving(false);

    if (error) {
      console.error(error);
      alert("Erreur d'enregistrement : " + error.message);
      return;
    }

    setEditingId(null);
    setEditForm(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="font-bold text-sm">
          Date
          <input
            type="date"
            className="input mt-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="font-bold text-sm">
          Recherche
          <input
            className="input mt-2"
            placeholder="Nom, prénom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="font-bold text-sm">
          Équipe
          <select
            className="input mt-2"
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="all">Toutes</option>
            {teamOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : filteredGrouped.length === 0 ? (
        <p className="card text-center text-slate-400">
          Aucun résultat pour ces filtres.
        </p>
      ) : (
        filteredGrouped.map(([teamName, members]) => (
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
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {members.map((e) => {
                  const r = byEmployee.get(e.id);
                  const isEditing = editingId === e.id;

                  if (isEditing && editForm) {
                    return (
                      <tr key={e.id} className="border-t border-slate-100 bg-slate-50">
                        <td className="py-2 pr-4 font-semibold align-top">
                          {employeeName(e)}
                        </td>
                        <td colSpan={6} className="py-2">
                          <div className="flex flex-wrap items-end gap-3">
                            <button
                              onClick={() =>
                                setEditForm({ ...editForm, absent: !editForm.absent })
                              }
                              className={`rounded-full px-3 py-1 text-xs font-bold ${
                                editForm.absent
                                  ? "bg-red-600 text-white"
                                  : "bg-slate-200"
                              }`}
                            >
                              Absent
                            </button>

                            {editForm.absent ? (
                              <select
                                className="input"
                                style={{ width: "auto" }}
                                value={editForm.absenceTypeId}
                                onChange={(ev) =>
                                  setEditForm({
                                    ...editForm,
                                    absenceTypeId: ev.target.value,
                                  })
                                }
                              >
                                <option value="">Type d&apos;absence</option>
                                {absenceTypes.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <>
                                <EditTime
                                  label="Début"
                                  value={editForm.start}
                                  onChange={(v) => setEditForm({ ...editForm, start: v })}
                                />
                                <EditTime
                                  label="Fin"
                                  value={editForm.end}
                                  onChange={(v) => setEditForm({ ...editForm, end: v })}
                                />
                                <EditTime
                                  label="Pause"
                                  value={editForm.pause}
                                  onChange={(v) => setEditForm({ ...editForm, pause: v })}
                                />
                                <EditTime
                                  label="H. Supp"
                                  value={editForm.extra}
                                  onChange={(v) => setEditForm({ ...editForm, extra: v })}
                                />
                              </>
                            )}

                            <button
                              onClick={() => saveEdit(e)}
                              disabled={saving}
                              className="btn btn-green text-xs px-3 py-2"
                            >
                              Enregistrer
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-slate-400 underline"
                            >
                              Annuler
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

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
                          <td className="py-2 pr-4">{(r.start_time ?? "—").slice(0, 5)}</td>
                          <td className="py-2 pr-4">{(r.end_time ?? "—").slice(0, 5)}</td>
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
                      <td
                        className={`py-2 pr-4 font-semibold ${
                          r ? "text-green-600" : ""
                        }`}
                      >
                        {r ? "OK" : ""}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => startEdit(e)}
                          className="text-xs text-slate-400 underline"
                        >
                          Modifier
                        </button>
                      </td>
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

function timeStrToMinutes(v: string | null) {
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function EditTime({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        className="input"
        style={{ width: "5.5rem" }}
        value={value}
        onChange={(ev) => onChange(formatLive(ev.target.value))}
        onBlur={(ev) => onChange(normalizeTime(ev.target.value))}
      />
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
        .select(POINTAGE_SELECT)
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
                        <td className="py-1.5 pr-4">{(r.start_time ?? "—").slice(0, 5)}</td>
                        <td className="py-1.5 pr-4">{(r.end_time ?? "—").slice(0, 5)}</td>
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

// ── Vue "Export / Import" ────────────────────────────────────────────────────
type ExportRow = {
  employee_id: string;
  Date: string;
  Équipe: string;
  Nom: string;
  Prénom: string;
  Début: string;
  Fin: string;
  "Pause (min)": number | null;
  "Heures Supp (min)": number | null;
  Absent: string;
  "Type d'absence": string;
  "Total (min)": number | null;
};

function parseTimeCell(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) {
    const hh = String(v.getUTCHours()).padStart(2, "0");
    const mm = String(v.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
  }
  if (typeof v === "number") {
    const totalMinutes = Math.round(v * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  return null;
}

function parseDateCell(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  }
  return null;
}

function ExportImportView({
  supabase,
  employees,
  absenceTypes,
}: {
  supabase: ReturnType<typeof createClient>;
  employees: Employee[];
  absenceTypes: AbsenceType[];
}) {
  const now = new Date();
  const { start: monthStart, end: monthEnd } = monthRange(
    now.getFullYear(),
    now.getMonth() + 1
  );
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(monthEnd);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  const absenceByLabel = useMemo(() => {
    const map = new Map<string, AbsenceType>();
    absenceTypes.forEach((a) => map.set(a.label.trim().toLowerCase(), a));
    return map;
  }, [absenceTypes]);

  async function handleExport() {
    setExporting(true);
    const { data, error } = await supabase
      .from("pointage_entries")
      .select(
        "employee_id, work_date, start_time, end_time, pause_minutes, overtime_minutes, is_absent, total_minutes, absence_types(label), employees!pointage_entries_employee_id_fkey(first_name, last_name, teams!employees_team_id_fkey(name))"
      )
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .order("work_date");
    setExporting(false);

    if (error) {
      alert("Erreur d'export : " + error.message);
      return;
    }

    type ExportSourceRow = PointageRow & {
      employees: {
        first_name: string;
        last_name: string;
        teams: { name: string } | null;
      } | null;
    };

    const exportRows: ExportRow[] = ((data as unknown as ExportSourceRow[]) ?? []).map(
      (r) => ({
        employee_id: r.employee_id,
        Date: r.work_date,
        Équipe: r.employees?.teams?.name ?? "",
        Nom: r.employees?.last_name ?? "",
        Prénom: r.employees?.first_name ?? "",
        Début: r.is_absent ? "" : (r.start_time ?? "").slice(0, 5),
        Fin: r.is_absent ? "" : (r.end_time ?? "").slice(0, 5),
        "Pause (min)": r.is_absent ? null : r.pause_minutes,
        "Heures Supp (min)": r.is_absent ? null : r.overtime_minutes,
        Absent: r.is_absent ? "Oui" : "Non",
        "Type d'absence": r.absence_types?.label ?? "",
        "Total (min)": r.total_minutes,
      })
    );

    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Pointage");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pointage_${dateFrom}_${dateTo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportSummary(null);
    setImportErrors([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const errors: string[] = [];
      const upserts: Record<string, unknown>[] = [];

      jsonRows.forEach((row, i) => {
        const rowLabel = `Ligne ${i + 2}`;
        const employeeId = String(row["employee_id"] ?? "").trim();
        const employee = employeeById.get(employeeId);
        if (!employee) {
          errors.push(`${rowLabel}: employee_id inconnu ou manquant`);
          return;
        }
        if (!employee.team_id) {
          errors.push(`${rowLabel}: ${employeeName(employee)} n'a pas d'équipe`);
          return;
        }

        const workDate = parseDateCell(row["Date"]);
        if (!workDate) {
          errors.push(`${rowLabel}: date invalide`);
          return;
        }

        const isAbsent =
          String(row["Absent"] ?? "").trim().toLowerCase() === "oui";

        let absenceTypeId: string | null = null;
        if (isAbsent) {
          const label = String(row["Type d'absence"] ?? "").trim().toLowerCase();
          absenceTypeId = label ? absenceByLabel.get(label)?.id ?? null : null;
        }

        upserts.push({
          work_date: workDate,
          team_id: employee.team_id,
          employee_id: employeeId,
          start_time: isAbsent ? null : parseTimeCell(row["Début"]),
          end_time: isAbsent ? null : parseTimeCell(row["Fin"]),
          pause_minutes: isAbsent ? null : Number(row["Pause (min)"]) || 0,
          overtime_minutes: isAbsent ? null : Number(row["Heures Supp (min)"]) || 0,
          is_absent: isAbsent,
          absence_type_id: absenceTypeId,
        });
      });

      if (upserts.length > 0) {
        const { error } = await supabase
          .from("pointage_entries")
          .upsert(upserts, { onConflict: "work_date,employee_id" });
        if (error) {
          errors.push("Erreur base de données : " + error.message);
        }
      }

      setImportSummary(
        `${upserts.length} ligne(s) importée(s) sur ${jsonRows.length}.`
      );
      setImportErrors(errors);
    } catch (err) {
      setImportErrors([
        "Impossible de lire le fichier : " +
          (err instanceof Error ? err.message : String(err)),
      ]);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="font-bold mb-1">Exporter</p>
        <p className="text-xs text-slate-400 mb-4">
          Télécharge un fichier Excel des pointages sur une période — à
          modifier puis réimporter si besoin.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="font-bold text-sm">
            Du
            <input
              type="date"
              className="input mt-2"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="font-bold text-sm">
            Au
            <input
              type="date"
              className="input mt-2"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-primary"
          >
            {exporting ? "Export…" : "Exporter (.xlsx)"}
          </button>
        </div>
      </div>

      <div className="card">
        <p className="font-bold mb-1">Importer</p>
        <p className="text-xs text-slate-400 mb-4">
          Réimporte un fichier au même format que l&apos;export — les lignes
          remplacent les données existantes pour la même date et le même
          employé (identifiées par la colonne <code>employee_id</code>).
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={importing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
          }}
        />
        {importing && <p className="text-sm text-slate-400 mt-3">Import en cours…</p>}
        {importSummary && (
          <p className="text-sm font-semibold text-green-600 mt-3">
            {importSummary}
          </p>
        )}
        {importErrors.length > 0 && (
          <div className="mt-3 text-sm text-red-600">
            <p className="font-semibold">Erreurs :</p>
            <ul className="list-disc pl-5">
              {importErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vue "Employés" — gestion de l'effectif (équipe, statut, départs) ────────
const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Actif",
  on_leave: "En congé",
  terminated: "Sorti",
};

type EmployeeEditForm = {
  teamId: string;
  status: EmployeeStatus;
  endDate: string;
};

function EmployeesView({
  supabase,
  teams,
  onChanged,
}: {
  supabase: ReturnType<typeof createClient>;
  teams: Team[];
  onChanged: () => void;
}) {
  const [employees, setEmployees] = useState<EmployeeFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EmployeeEditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    firstName: "",
    lastName: "",
    teamId: "",
  });
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("active");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "chantier" | "bureau">(
    "all"
  );
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("employees")
        .select(
          "id, first_name, last_name, team_id, status, category, hire_date, end_date, teams!employees_team_id_fkey(name)"
        )
        .order("category")
        .order("status")
        .order("last_name");
      setEmployees((data as unknown as EmployeeFull[]) ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const counts = useMemo(() => {
    const c = { active: 0, on_leave: 0, terminated: 0 };
    employees.forEach((e) => {
      c[e.status]++;
    });
    return c;
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (teamFilter === "none" && e.team_id) return false;
      if (teamFilter !== "all" && teamFilter !== "none" && e.team_id !== teamFilter)
        return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (q && !employeeName(e).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, statusFilter, teamFilter, categoryFilter, search]);

  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams]
  );

  function startEdit(e: EmployeeFull) {
    setEditingId(e.id);
    setEditForm({
      teamId: e.team_id ?? "",
      status: e.status,
      endDate: e.end_date ?? "",
    });
  }

  async function saveEdit(e: EmployeeFull) {
    if (!editForm) return;
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({
        team_id: editForm.teamId || null,
        status: editForm.status,
        end_date: editForm.status === "terminated" ? editForm.endDate || null : null,
      })
      .eq("id", e.id);
    setSaving(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setEditingId(null);
    setEditForm(null);
    setRefreshKey((k) => k + 1);
    onChanged();
  }

  async function addEmployee() {
    if (!newEmployee.firstName.trim() || !newEmployee.lastName.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("employees").insert({
      first_name: newEmployee.firstName.trim(),
      last_name: newEmployee.lastName.trim(),
      category: "chantier",
      team_id: newEmployee.teamId || null,
      status: "active",
    });
    setAdding(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setNewEmployee({ firstName: "", lastName: "", teamId: "" });
    setShowAddForm(false);
    setRefreshKey((k) => k + 1);
    onChanged();
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold">
            Employés ({filtered.length}/{employees.length})
          </p>
          <button
            className="btn btn-primary text-sm px-3 py-2"
            onClick={() => setShowAddForm((v) => !v)}
          >
            + Nouvel employé
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setStatusFilter("active")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "active"
                ? "bg-green-600 text-white"
                : "bg-green-50 text-green-700"
            }`}
          >
            {counts.active} actifs
          </button>
          <button
            onClick={() => setStatusFilter("on_leave")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "on_leave"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {counts.on_leave} en congé
          </button>
          <button
            onClick={() => setStatusFilter("terminated")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "terminated"
                ? "bg-red-600 text-white"
                : "bg-red-50 text-red-700"
            }`}
          >
            {counts.terminated} sortis
          </button>
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            Tous ({employees.length})
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Recherche
            </label>
            <input
              className="input"
              placeholder="Nom, prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Équipe
            </label>
            <select
              className="input"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="all">Toutes</option>
              <option value="none">Sans équipe</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Catégorie
            </label>
            <select
              className="input"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as "all" | "chantier" | "bureau")
              }
            >
              <option value="all">Toutes</option>
              <option value="chantier">Chantier</option>
              <option value="bureau">Bureau</option>
            </select>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="card mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Prénom
            </label>
            <input
              className="input"
              value={newEmployee.firstName}
              onChange={(e) =>
                setNewEmployee({ ...newEmployee, firstName: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400">Nom</label>
            <input
              className="input"
              value={newEmployee.lastName}
              onChange={(e) =>
                setNewEmployee({ ...newEmployee, lastName: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Équipe
            </label>
            <select
              className="input"
              value={newEmployee.teamId}
              onChange={(e) =>
                setNewEmployee({ ...newEmployee, teamId: e.target.value })
              }
            >
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-green text-sm px-3 py-2"
            disabled={adding}
            onClick={addEmployee}
          >
            {adding ? "…" : "Ajouter"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="card text-center text-slate-400">
          Aucun employé ne correspond à ces filtres.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Équipe</th>
                <th className="pb-2 pr-4">Statut</th>
                <th className="pb-2 pr-4">Date de fin</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const isEditing = editingId === e.id;
                return (
                  <Fragment key={e.id}>
                  <tr className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-semibold">
                      {employeeName(e)}
                    </td>
                    {isEditing && editForm ? (
                      <>
                        <td className="py-2 pr-4">
                          <select
                            className="input"
                            style={{ width: "auto" }}
                            value={editForm.teamId}
                            onChange={(ev) =>
                              setEditForm({ ...editForm, teamId: ev.target.value })
                            }
                          >
                            <option value="">—</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className="input"
                            style={{ width: "auto" }}
                            value={editForm.status}
                            onChange={(ev) =>
                              setEditForm({
                                ...editForm,
                                status: ev.target.value as EmployeeStatus,
                              })
                            }
                          >
                            {(
                              ["active", "on_leave", "terminated"] as EmployeeStatus[]
                            ).map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          {editForm.status === "terminated" && (
                            <input
                              type="date"
                              className="input"
                              value={editForm.endDate}
                              onChange={(ev) =>
                                setEditForm({ ...editForm, endDate: ev.target.value })
                              }
                            />
                          )}
                        </td>
                        <td className="py-2">
                          <button
                            className="btn btn-green text-xs px-3 py-1 mr-2"
                            disabled={saving}
                            onClick={() => saveEdit(e)}
                          >
                            Enregistrer
                          </button>
                          <button
                            className="text-xs text-slate-400 underline"
                            onClick={() => setEditingId(null)}
                          >
                            Annuler
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-slate-500">
                          {e.team_id ? teamsById.get(e.team_id) ?? "—" : "—"}
                        </td>
                        <td
                          className={`py-2 pr-4 font-semibold ${
                            e.status === "terminated"
                              ? "text-red-600"
                              : e.status === "on_leave"
                              ? "text-amber-600"
                              : "text-green-600"
                          }`}
                        >
                          {STATUS_LABELS[e.status]}
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {e.end_date ?? "—"}
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          <button
                            className="text-xs text-slate-400 underline mr-3"
                            onClick={() => startEdit(e)}
                          >
                            Modifier
                          </button>
                          <button
                            className="text-xs text-slate-400 underline"
                            onClick={() =>
                              setExpandedId(expandedId === e.id ? null : e.id)
                            }
                          >
                            {expandedId === e.id ? "Fermer" : "Détails"}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                  {expandedId === e.id && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={5} className="bg-slate-50 p-4">
                        <EmployeeDetailPanel supabase={supabase} employeeId={e.id} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Panneau détail employé — profil étendu + confidentiel (RIB, SS, visa) ───
type EmployeeProfileFields = {
  sex: string | null;
  qualification: string | null;
  contract_type: string | null;
  job_title: string | null;
  device_label: string | null;
  hire_date: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
};

type ConfidentialFields = {
  nationality: string | null;
  rib: string | null;
  securite_sociale: string | null;
  status_ameli: string | null;
  carte_vitale: string | null;
  mutuelle: string | null;
  residence_permit_type: string | null;
  residence_permit_number: string | null;
};

const EMPTY_CONFIDENTIAL: ConfidentialFields = {
  nationality: null,
  rib: null,
  securite_sociale: null,
  status_ameli: null,
  carte_vitale: null,
  mutuelle: null,
  residence_permit_type: null,
  residence_permit_number: null,
};

function EmployeeDetailPanel({
  supabase,
  employeeId,
}: {
  supabase: ReturnType<typeof createClient>;
  employeeId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<EmployeeProfileFields | null>(null);
  const [confidential, setConfidential] =
    useState<ConfidentialFields>(EMPTY_CONFIDENTIAL);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: emp }, { data: conf }] = await Promise.all([
        supabase
          .from("employees")
          .select(
            "sex, qualification, contract_type, job_title, device_label, hire_date, date_of_birth, phone, email"
          )
          .eq("id", employeeId)
          .single(),
        supabase
          .from("employee_confidential")
          .select("*")
          .eq("employee_id", employeeId)
          .maybeSingle(),
      ]);
      setProfile((emp as EmployeeProfileFields) ?? null);
      setConfidential({ ...EMPTY_CONFIDENTIAL, ...(conf ?? {}) });
      setLoading(false);
    }
    load();
  }, [employeeId, supabase]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error: profileError } = await supabase
      .from("employees")
      .update(profile)
      .eq("id", employeeId);
    const { error: confError } = await supabase
      .from("employee_confidential")
      .upsert(
        { ...confidential, employee_id: employeeId },
        { onConflict: "employee_id" }
      );
    setSaving(false);

    if (profileError || confError) {
      alert("Erreur : " + (profileError?.message || confError?.message));
      return;
    }
    setSavedAt(new Date().toLocaleTimeString("fr-FR"));
  }

  if (loading) return <p className="text-sm text-slate-400">Chargement…</p>;
  if (!profile) return null;

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
        Profil
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <DetailField
          label="Sexe"
          value={profile.sex}
          onChange={(v) => setProfile({ ...profile, sex: v })}
        />
        <DetailField
          label="Qualification"
          value={profile.qualification}
          onChange={(v) => setProfile({ ...profile, qualification: v })}
        />
        <DetailField
          label="Type de contrat"
          value={profile.contract_type}
          onChange={(v) => setProfile({ ...profile, contract_type: v })}
        />
        <DetailField
          label="Poste / Emploi"
          value={profile.job_title}
          onChange={(v) => setProfile({ ...profile, job_title: v })}
        />
        <DetailField
          label="Téléphone"
          value={profile.phone}
          onChange={(v) => setProfile({ ...profile, phone: v })}
        />
        <DetailField
          label="Email"
          value={profile.email}
          onChange={(v) => setProfile({ ...profile, email: v })}
        />
        <DetailField
          label="Date de naissance"
          type="date"
          value={profile.date_of_birth}
          onChange={(v) => setProfile({ ...profile, date_of_birth: v })}
        />
        <DetailField
          label="Date d'embauche"
          type="date"
          value={profile.hire_date}
          onChange={(v) => setProfile({ ...profile, hire_date: v })}
        />
      </div>

      <p className="text-xs font-bold uppercase tracking-wide text-red-500 mb-2">
        Confidentiel — RH uniquement
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <DetailField
          label="Nationalité"
          value={confidential.nationality}
          onChange={(v) => setConfidential({ ...confidential, nationality: v })}
        />
        <DetailField
          label="RIB"
          value={confidential.rib}
          onChange={(v) => setConfidential({ ...confidential, rib: v })}
        />
        <DetailField
          label="Sécurité sociale"
          value={confidential.securite_sociale}
          onChange={(v) =>
            setConfidential({ ...confidential, securite_sociale: v })
          }
        />
        <DetailField
          label="Statut Ameli"
          value={confidential.status_ameli}
          onChange={(v) => setConfidential({ ...confidential, status_ameli: v })}
        />
        <DetailField
          label="Carte Vitale"
          value={confidential.carte_vitale}
          onChange={(v) => setConfidential({ ...confidential, carte_vitale: v })}
        />
        <DetailField
          label="Mutuelle"
          value={confidential.mutuelle}
          onChange={(v) => setConfidential({ ...confidential, mutuelle: v })}
        />
        <DetailField
          label="Type de titre de séjour"
          value={confidential.residence_permit_type}
          onChange={(v) =>
            setConfidential({ ...confidential, residence_permit_type: v })
          }
        />
        <DetailField
          label="N° du titre"
          value={confidential.residence_permit_number}
          onChange={(v) =>
            setConfidential({ ...confidential, residence_permit_number: v })
          }
        />
      </div>

      <button
        className="btn btn-green text-sm px-4 py-2"
        disabled={saving}
        onClick={save}
      >
        {saving ? "…" : "Enregistrer"}
      </button>
      {savedAt && (
        <span className="ml-3 text-xs font-semibold text-green-600">
          Enregistré à {savedAt}
        </span>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase text-slate-400">
        {label}
      </label>
      <input
        type={type}
        className="input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Vue "Médical" — RDV médecine du travail ─────────────────────────────────
type MedicalVisit = {
  id: string;
  employee_id: string;
  last_visit_date: string | null;
  next_visit_date: string | null;
  visit_subtype: string | null;
  employees: {
    first_name: string;
    last_name: string;
    team_id: string | null;
    teams: { name: string } | null;
  } | null;
};

function MedicalView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [visits, setVisits] = useState<MedicalVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    last: string;
    next: string;
    subtype: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [teamFilter, setTeamFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("medical_visits")
        .select(
          "id, employee_id, last_visit_date, next_visit_date, visit_subtype, employees(first_name, last_name, team_id, teams!employees_team_id_fkey(name))"
        )
        .order("next_visit_date", { ascending: true, nullsFirst: false });
      setVisits((data as unknown as MedicalVisit[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase, refreshKey]);

  const teamOptions = useMemo(() => {
    const map = new Map<string, string>();
    visits.forEach((v) => {
      if (v.employees?.team_id && v.employees.teams?.name) {
        map.set(v.employees.team_id, v.employees.teams.name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [visits]);

  const filteredVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visits.filter((v) => {
      if (teamFilter !== "all" && v.employees?.team_id !== teamFilter) return false;
      if (q && !(v.employees && employeeName(v.employees).toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [visits, teamFilter, search]);

  function startEdit(v: MedicalVisit) {
    setEditingId(v.id);
    setEditForm({
      last: v.last_visit_date ?? "",
      next: v.next_visit_date ?? "",
      subtype: v.visit_subtype ?? "",
    });
  }

  async function saveEdit(v: MedicalVisit) {
    if (!editForm) return;
    setSaving(true);
    const { error } = await supabase
      .from("medical_visits")
      .update({
        last_visit_date: editForm.last || null,
        next_visit_date: editForm.next || null,
        visit_subtype: editForm.subtype || null,
      })
      .eq("id", v.id);
    setSaving(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    setEditingId(null);
    setRefreshKey((k) => k + 1);
  }

  const todayIso = today();

  return (
    <div>
      <div className="card mb-4">
        <p className="font-bold">
          Visites médicales ({filteredVisits.length}/{visits.length})
        </p>
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Recherche
            </label>
            <input
              className="input"
              placeholder="Nom, prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Équipe
            </label>
            <select
              className="input"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="all">Toutes</option>
              {teamOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : filteredVisits.length === 0 ? (
        <p className="card text-center text-slate-400">
          Aucune visite ne correspond à ces filtres.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Dernière visite</th>
                <th className="pb-2 pr-4">Prochaine visite</th>
                <th className="pb-2 pr-4">Sous-type</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filteredVisits.map((v) => {
                const isEditing = editingId === v.id;
                const isOverdue = !!v.next_visit_date && v.next_visit_date < todayIso;
                return (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-semibold">
                      {v.employees ? employeeName(v.employees) : "—"}
                    </td>
                    {isEditing && editForm ? (
                      <>
                        <td className="py-2 pr-4">
                          <input
                            type="date"
                            className="input"
                            value={editForm.last}
                            onChange={(e) =>
                              setEditForm({ ...editForm, last: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="date"
                            className="input"
                            value={editForm.next}
                            onChange={(e) =>
                              setEditForm({ ...editForm, next: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            className="input"
                            value={editForm.subtype}
                            onChange={(e) =>
                              setEditForm({ ...editForm, subtype: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          <button
                            className="btn btn-green text-xs px-3 py-1 mr-2"
                            disabled={saving}
                            onClick={() => saveEdit(v)}
                          >
                            Enregistrer
                          </button>
                          <button
                            className="text-xs text-slate-400 underline"
                            onClick={() => setEditingId(null)}
                          >
                            Annuler
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4">{v.last_visit_date ?? "—"}</td>
                        <td
                          className={`py-2 pr-4 font-semibold ${
                            isOverdue ? "text-red-600" : ""
                          }`}
                        >
                          {v.next_visit_date ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {v.visit_subtype ?? "—"}
                        </td>
                        <td className="py-2">
                          <button
                            className="text-xs text-slate-400 underline"
                            onClick={() => startEdit(v)}
                          >
                            Modifier
                          </button>
                        </td>
                      </>
                    )}
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

// ── Vue "Formations" — matrice des habilitations ────────────────────────────
type TrainingType = { id: string; code: string; label: string };
type EmployeeTrainingRow = {
  employee_id: string;
  training_type_id: string;
  status: string;
};

function FormationsView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trainings, setTrainings] = useState<EmployeeTrainingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [teamFilter, setTeamFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: typeRows }, { data: empRows }, { data: trainRows }] =
        await Promise.all([
          supabase
            .from("training_types")
            .select("id, code, label")
            .order("mandatory", { ascending: false }),
          supabase
            .from("employees")
            .select(
              "id, first_name, last_name, team_id, teams!employees_team_id_fkey(name)"
            )
            .eq("category", "chantier")
            .eq("status", "active")
            .order("last_name"),
          supabase.from("employee_trainings").select("employee_id, training_type_id, status"),
        ]);
      setTypes(typeRows ?? []);
      setEmployees((empRows as unknown as Employee[]) ?? []);
      setTrainings(trainRows ?? []);
      setLoading(false);
    }
    load();
  }, [supabase, refreshKey]);

  const statusMap = useMemo(() => {
    const m = new Map<string, string>();
    trainings.forEach((t) => m.set(`${t.employee_id}|${t.training_type_id}`, t.status));
    return m;
  }, [trainings]);

  const teamOptions = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e) => {
      if (e.team_id && e.teams?.name) map.set(e.team_id, e.teams.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (teamFilter !== "all" && e.team_id !== teamFilter) return false;
      if (q && !employeeName(e).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, teamFilter, search]);

  async function toggle(employeeId: string, typeId: string, current: string | undefined) {
    const next = current === "ok" ? "ko" : "ok";
    const key = `${employeeId}|${typeId}`;
    setSaving(key);
    const { error } = await supabase
      .from("employee_trainings")
      .upsert(
        { employee_id: employeeId, training_type_id: typeId, status: next },
        { onConflict: "employee_id,training_type_id" }
      );
    setSaving(null);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="card mb-4">
        <p className="font-bold">
          Formations & habilitations ({filteredEmployees.length}/{employees.length})
        </p>
        <p className="text-xs text-slate-400 mb-3">
          Cliquer une cellule pour basculer OK / KO.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Recherche
            </label>
            <input
              className="input"
              placeholder="Nom, prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Équipe
            </label>
            <select
              className="input"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="all">Toutes</option>
              {teamOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : filteredEmployees.length === 0 ? (
        <p className="card text-center text-slate-400">
          Aucun employé ne correspond à ces filtres.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Équipe</th>
                {types.map((t) => (
                  <th key={t.id} className="pb-2 px-2 text-center" title={t.label}>
                    {t.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-semibold">{employeeName(e)}</td>
                  <td className="py-2 pr-4 text-slate-500">
                    {e.teams?.name ?? "—"}
                  </td>
                  {types.map((t) => {
                    const key = `${e.id}|${t.id}`;
                    const status = statusMap.get(key);
                    return (
                      <td key={t.id} className="py-2 px-2 text-center">
                        <button
                          onClick={() => toggle(e.id, t.id, status)}
                          disabled={saving === key}
                          className={`w-10 rounded-full px-2 py-1 text-xs font-bold ${
                            status === "ok"
                              ? "bg-green-100 text-green-700"
                              : status === "ko"
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {status ? status.toUpperCase() : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vue "Tailles" — équipement / EPI ─────────────────────────────────────────
type EquipmentSize = {
  employee_id: string;
  chaussures: string | null;
  pantalon: string | null;
  tshirt: string | null;
  notes: string | null;
};

function TaillesView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sizes, setSizes] = useState<EquipmentSize[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    chaussures: string;
    pantalon: string;
    tshirt: string;
    notes: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [teamFilter, setTeamFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: empRows }, { data: sizeRows }] = await Promise.all([
        supabase
          .from("employees")
          .select(
            "id, first_name, last_name, team_id, teams!employees_team_id_fkey(name)"
          )
          .eq("category", "chantier")
          .eq("status", "active")
          .order("last_name"),
        supabase.from("employee_equipment_sizes").select("*"),
      ]);
      setEmployees((empRows as unknown as Employee[]) ?? []);
      setSizes(sizeRows ?? []);
      setLoading(false);
    }
    load();
  }, [supabase, refreshKey]);

  const sizeByEmployee = useMemo(
    () => new Map(sizes.map((s) => [s.employee_id, s])),
    [sizes]
  );

  const teamOptions = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e) => {
      if (e.team_id && e.teams?.name) map.set(e.team_id, e.teams.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (teamFilter !== "all" && e.team_id !== teamFilter) return false;
      if (q && !employeeName(e).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, teamFilter, search]);

  function startEdit(id: string) {
    const s = sizeByEmployee.get(id);
    setEditingId(id);
    setEditForm({
      chaussures: s?.chaussures ?? "",
      pantalon: s?.pantalon ?? "",
      tshirt: s?.tshirt ?? "",
      notes: s?.notes ?? "",
    });
  }

  async function saveEdit(id: string) {
    if (!editForm) return;
    setSaving(true);
    const { error } = await supabase.from("employee_equipment_sizes").upsert(
      {
        employee_id: id,
        chaussures: editForm.chaussures || null,
        pantalon: editForm.pantalon || null,
        tshirt: editForm.tshirt || null,
        notes: editForm.notes || null,
      },
      { onConflict: "employee_id" }
    );
    setSaving(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    setEditingId(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="card mb-4">
        <p className="font-bold">
          Tailles / équipement ({filteredEmployees.length}/{employees.length})
        </p>
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Recherche
            </label>
            <input
              className="input"
              placeholder="Nom, prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400">
              Équipe
            </label>
            <select
              className="input"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="all">Toutes</option>
              {teamOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Chargement…</p>
      ) : filteredEmployees.length === 0 ? (
        <p className="card text-center text-slate-400">
          Aucun employé ne correspond à ces filtres.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Chaussures</th>
                <th className="pb-2 pr-4">Pantalon</th>
                <th className="pb-2 pr-4">T-shirt</th>
                <th className="pb-2 pr-4">Notes</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((e) => {
                const s = sizeByEmployee.get(e.id);
                const isEditing = editingId === e.id;
                return (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-semibold">{employeeName(e)}</td>
                    {isEditing && editForm ? (
                      <>
                        <td className="py-2 pr-4">
                          <input
                            className="input"
                            style={{ width: "5rem" }}
                            value={editForm.chaussures}
                            onChange={(ev) =>
                              setEditForm({ ...editForm, chaussures: ev.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            className="input"
                            style={{ width: "5rem" }}
                            value={editForm.pantalon}
                            onChange={(ev) =>
                              setEditForm({ ...editForm, pantalon: ev.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            className="input"
                            style={{ width: "5rem" }}
                            value={editForm.tshirt}
                            onChange={(ev) =>
                              setEditForm({ ...editForm, tshirt: ev.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            className="input"
                            value={editForm.notes}
                            onChange={(ev) =>
                              setEditForm({ ...editForm, notes: ev.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          <button
                            className="btn btn-green text-xs px-3 py-1 mr-2"
                            disabled={saving}
                            onClick={() => saveEdit(e.id)}
                          >
                            Enregistrer
                          </button>
                          <button
                            className="text-xs text-slate-400 underline"
                            onClick={() => setEditingId(null)}
                          >
                            Annuler
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-slate-500">
                          {s?.chaussures ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {s?.pantalon ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-500">
                          {s?.tshirt ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-slate-500">{s?.notes ?? "—"}</td>
                        <td className="py-2">
                          <button
                            className="text-xs text-slate-400 underline"
                            onClick={() => startEdit(e.id)}
                          >
                            Modifier
                          </button>
                        </td>
                      </>
                    )}
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
