"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  ArrowLeft,
  BarChart3,
  Banknote,
  BookText,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  Download,
  FileSignature,
  FileSpreadsheet,
  FileText,
  FolderLock,
  Fingerprint,
  GraduationCap,
  HardHat,
  HeartPulse,
  Image as ImageIcon,
  Languages,
  LogOut,
  Network,
  Plane,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Trash2,
  Upload,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatLive, normalizeTime, timeToMinutes, minutesToHHMM } from "@/lib/time";
import { DOCUMENT_TYPES, getDocumentType } from "@/lib/documents/registry";
import {
  CompanyRow,
  EMPLOYEE_DOC_SELECT,
  EmployeeRow as DocEmployeeRow,
  mapCompanyRow,
  mapEmployeeRow,
} from "@/lib/documents/mappers";
import { CompanyDoc, EmployeeDoc } from "@/lib/documents/types";
import { computePayrollLine, DEFAULT_PAYROLL_PARAMS, PayrollParams } from "@/lib/payroll/compute";
import { countWorkingDaysInMonth, frenchHolidaysInMonth, weekdayLabelFr } from "@/lib/payroll/frenchHolidays";
import { isForeignNationality } from "@/lib/nationality";
import { LogoMark } from "@/components/Logo";
import { Skeleton, SkeletonRows } from "@/components/Skeleton";
import { toast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/StateMessage";

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

/** Module-level (not component-scoped) so calling it from an event handler isn't
 *  flagged as an impure call during render. */
function uniqueFileToken() {
  return Date.now();
}

function daysUntil(iso: string): number {
  const now = new Date(today() + "T00:00:00Z").getTime();
  const target = new Date(iso + "T00:00:00Z").getTime();
  return Math.round((target - now) / 86400000);
}

/** Shared "expiring/overdue" badge logic for document expiry dates and the next
 *  médecine du travail visit — same urgency language either way. */
function dateUrgency(iso: string | null): { label: string; tone: "error" | "warning" } | null {
  if (!iso) return null;
  const days = daysUntil(iso);
  if (days < 0) return { label: "En retard", tone: "error" };
  if (days <= 30) return { label: `Dans ${days} j`, tone: "warning" };
  return null;
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
  | "tailles"
  | "documents"
  | "registre"
  | "organigramme"
  | "francais"
  | "dossier"
  | "paie";

type NavItem = { key: ViewKey; label: string; icon: LucideIcon };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Pointage",
    items: [
      { key: "jour", label: "Par jour", icon: CalendarDays },
      { key: "employe", label: "Par employé", icon: User },
      { key: "mois", label: "Totaux du mois", icon: BarChart3 },
      { key: "export", label: "Export / Import", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Effectif",
    items: [
      { key: "effectif", label: "Employés", icon: Users },
      { key: "medical", label: "Médical", icon: HeartPulse },
      { key: "formations", label: "Formations", icon: GraduationCap },
      { key: "tailles", label: "Tailles", icon: Shirt },
    ],
  },
  {
    title: "RH",
    items: [
      { key: "documents", label: "Documents", icon: FileText },
      { key: "registre", label: "Registre du personnel", icon: BookText },
      { key: "organigramme", label: "Organigramme", icon: Network },
      { key: "francais", label: "Cours de français", icon: Languages },
      { key: "dossier", label: "Dossier salarié", icon: FolderLock },
      { key: "paie", label: "Paie", icon: Wallet },
    ],
  },
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
      <main className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="card w-full max-w-sm space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="card max-w-sm text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white">
            <LogoMark size={22} />
          </div>
          <p className="font-bold text-slate-900">Accès réservé RH</p>
          <p className="text-sm text-slate-400 mt-1">Доступ только для RH.</p>
          <Link href="/" className="btn btn-dark mt-4 inline-flex">
            Retour
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white shadow-[var(--shadow-pop)]">
              <LogoMark size={24} />
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight text-slate-900 leading-tight">
                VLADIS
              </p>
              <p className="text-xs font-semibold text-slate-400 leading-tight">
                Tableau de bord RH
              </p>
            </div>
          </div>
          <Link href="/" className="btn btn-secondary text-sm">
            <ArrowLeft size={15} />
            Retour au pointage
          </Link>
        </div>

        <div className="flex gap-6 items-start">
          <aside className="w-60 shrink-0">
            <nav className="card p-3 space-y-4 sticky top-4">
              {NAV_GROUPS.map((group) => (
                <SidebarSection key={group.title} title={group.title}>
                  {group.items.map((item) => (
                    <SidebarLink
                      key={item.key}
                      icon={item.icon}
                      active={view === item.key}
                      onClick={() => setView(item.key)}
                    >
                      {item.label}
                    </SidebarLink>
                  ))}
                </SidebarSection>
              ))}
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
            {view === "documents" && <DocumentsView supabase={supabase} />}
            {view === "registre" && <RegistreView supabase={supabase} />}
            {view === "organigramme" && <OrganigrammeView supabase={supabase} />}
            {view === "francais" && <FrancaisView supabase={supabase} />}
            {view === "dossier" && <DossierView supabase={supabase} />}
            {view === "paie" && <PaieView supabase={supabase} />}
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
      <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({
  active,
  disabled,
  onClick,
  icon: Icon,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        disabled
          ? "text-slate-300 cursor-not-allowed"
          : active
          ? "bg-primary-50 text-primary-700"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      }`}
    >
      {Icon && (
        <Icon
          size={16}
          className={
            disabled
              ? "text-slate-300"
              : active
              ? "text-primary-600"
              : "text-slate-400 group-hover:text-slate-500"
          }
        />
      )}
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
      toast.error("Erreur d'enregistrement : " + error.message);
      return;
    }

    setEditingId(null);
    setEditForm(null);
    setRefreshKey((k) => k + 1);
    toast.success("Pointage enregistré");
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
        <div className="card">
          <SkeletonRows rows={5} cols={5} />
        </div>
      ) : filteredGrouped.length === 0 ? (
        <div className="card">
          <EmptyState description="Aucun résultat pour ces filtres." />
        </div>
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
                                  ? "bg-error-600 text-white"
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
                        <td colSpan={5} className="py-2 text-error-600 font-semibold">
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
                          r ? "text-success-600" : ""
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
        <div className="card">
          <EmptyState title="Sélectionnez un employé" />
        </div>
      ) : loading ? (
        <div className="card">
          <SkeletonRows rows={5} cols={4} />
        </div>
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
                      <td colSpan={4} className="py-1.5 text-error-600 font-semibold">
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
        <div className="card">
          <SkeletonRows rows={5} cols={5} />
        </div>
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
                        total ? "text-success-600" : "text-slate-300"
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
      toast.error("Erreur d'export : " + error.message);
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
          <p className="text-sm font-semibold text-success-600 mt-3">
            {importSummary}
          </p>
        )}
        {importErrors.length > 0 && (
          <div className="mt-3 text-sm text-error-600">
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
      toast.error("Erreur : " + error.message);
      return;
    }

    setEditingId(null);
    setEditForm(null);
    setRefreshKey((k) => k + 1);
    onChanged();
    toast.success("Employé mis à jour");
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
      toast.error("Erreur : " + error.message);
      return;
    }

    setNewEmployee({ firstName: "", lastName: "", teamId: "" });
    setShowAddForm(false);
    setRefreshKey((k) => k + 1);
    onChanged();
    toast.success("Employé ajouté");
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
                ? "bg-success-600 text-white"
                : "bg-success-50 text-success-700"
            }`}
          >
            {counts.active} actifs
          </button>
          <button
            onClick={() => setStatusFilter("on_leave")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "on_leave"
                ? "bg-warning-600 text-white"
                : "bg-warning-50 text-warning-700"
            }`}
          >
            {counts.on_leave} en congé
          </button>
          <button
            onClick={() => setStatusFilter("terminated")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "terminated"
                ? "bg-error-600 text-white"
                : "bg-error-50 text-error-700"
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
        <div className="card">
          <SkeletonRows rows={5} cols={5} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState description="Aucun employé ne correspond à ces filtres." />
        </div>
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
                              ? "text-error-600"
                              : e.status === "on_leave"
                              ? "text-warning-600"
                              : "text-success-600"
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!expandedId}
        onClose={() => setExpandedId(null)}
        title={
          expandedId
            ? `Détails — ${employeeName(filtered.find((e) => e.id === expandedId) ?? { first_name: "", last_name: "" })}`
            : "Détails"
        }
        maxWidth="max-w-3xl"
      >
        {expandedId && <EmployeeDetailPanel supabase={supabase} employeeId={expandedId} />}
      </Modal>
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
  address: string | null;
  birth_place: string | null;
  classification: string | null;
  classe: string | null;
  weekly_hours: number | null;
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
  monthly_gross_salary: number | null;
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
  monthly_gross_salary: null,
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
            "sex, qualification, contract_type, job_title, device_label, hire_date, date_of_birth, phone, email, address, birth_place, classification, classe, weekly_hours"
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
      toast.error("Erreur : " + (profileError?.message || confError?.message));
      return;
    }
    setSavedAt(new Date().toLocaleTimeString("fr-FR"));
  }

  if (loading) return <SkeletonRows rows={3} cols={2} />;
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
        <DetailField
          label="Lieu de naissance"
          value={profile.birth_place}
          onChange={(v) => setProfile({ ...profile, birth_place: v })}
        />
        <DetailField
          label="Adresse"
          value={profile.address}
          onChange={(v) => setProfile({ ...profile, address: v })}
        />
        <DetailField
          label="Classification (groupe A–I)"
          value={profile.classification}
          onChange={(v) => setProfile({ ...profile, classification: v })}
        />
        <DetailField
          label="Classe (coefficient)"
          value={profile.classe}
          onChange={(v) => setProfile({ ...profile, classe: v })}
        />
        <DetailField
          label="Heures hebdomadaires"
          type="number"
          value={profile.weekly_hours?.toString() ?? null}
          onChange={(v) => setProfile({ ...profile, weekly_hours: v === "" ? null : Number(v) })}
        />
      </div>

      <p className="text-xs font-bold uppercase tracking-wide text-error-500 mb-2">
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
        <DetailField
          label="Salaire mensuel brut (€)"
          type="number"
          value={confidential.monthly_gross_salary?.toString() ?? null}
          onChange={(v) =>
            setConfidential({
              ...confidential,
              monthly_gross_salary: v === "" ? null : Number(v),
            })
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
        <span className="ml-3 text-xs font-semibold text-success-600">
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
      toast.error("Erreur : " + error.message);
      return;
    }
    setEditingId(null);
    setRefreshKey((k) => k + 1);
    toast.success("Visite médicale mise à jour");
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
        <div className="card">
          <SkeletonRows rows={5} cols={5} />
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="card">
          <EmptyState description="Aucune visite ne correspond à ces filtres." />
        </div>
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
                            isOverdue ? "text-error-600" : ""
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
      toast.error("Erreur : " + error.message);
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
        <div className="card">
          <SkeletonRows rows={5} cols={5} />
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="card">
          <EmptyState description="Aucun employé ne correspond à ces filtres." />
        </div>
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
                              ? "bg-success-100 text-success-700"
                              : status === "ko"
                              ? "bg-error-100 text-error-700"
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
      toast.error("Erreur : " + error.message);
      return;
    }
    setEditingId(null);
    setRefreshKey((k) => k + 1);
    toast.success("Tailles enregistrées");
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
        <div className="card">
          <SkeletonRows rows={5} cols={5} />
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="card">
          <EmptyState description="Aucun employé ne correspond à ces filtres." />
        </div>
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

// ── Vue "Documents" — génération de contrats/NDA/attestations/ruptures ──────
type DocEmployeeListRow = {
  id: string;
  first_name: string;
  last_name: string;
  status: EmployeeStatus;
  category: "chantier" | "bureau";
};

type FormValue = string | number | boolean;

function DocumentsView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [employees, setEmployees] = useState<DocEmployeeListRow[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("active");
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const [employeeDoc, setEmployeeDoc] = useState<EmployeeDoc | null>(null);
  const [companyDoc, setCompanyDoc] = useState<CompanyDoc | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [typeCode, setTypeCode] = useState<string>(DOCUMENT_TYPES[0].code);
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({});
  const [generating, setGenerating] = useState<"pdf" | "docx" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoadingEmployees(true);
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name, status, category")
        .order("last_name");
      setEmployees((data as unknown as DocEmployeeListRow[]) ?? []);
      setLoadingEmployees(false);
    }
    load();
  }, [supabase]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle<CompanyRow>();
      if (data) setCompanyDoc(mapCompanyRow(data));
    }
    load();
  }, [supabase]);

  useEffect(() => {
    async function load() {
      if (!selectedEmployeeId) {
        setEmployeeDoc(null);
        return;
      }
      setLoadingDetail(true);
      const { data } = await supabase
        .from("employees")
        .select(EMPLOYEE_DOC_SELECT)
        .eq("id", selectedEmployeeId)
        .maybeSingle<DocEmployeeRow>();
      setEmployeeDoc(data ? mapEmployeeRow(data) : null);
      setLoadingDetail(false);
    }
    load();
  }, [supabase, selectedEmployeeId]);

  const definition = useMemo(() => getDocumentType(typeCode), [typeCode]);

  useEffect(() => {
    function applyDefaults() {
      if (!employeeDoc || !companyDoc || !definition) return;
      const next: Record<string, FormValue> = {};
      definition.fields.forEach((f) => {
        const dv = f.defaultValue ? f.defaultValue(employeeDoc, companyDoc) : null;
        if (f.type === "boolean") next[f.key] = (dv as boolean) ?? false;
        else if (f.type === "number") next[f.key] = dv === null ? "" : (dv as number);
        else next[f.key] = (dv as string) ?? "";
      });
      setFormValues(next);
      setErrorMsg(null);
    }
    applyDefaults();
  }, [definition, employeeDoc, companyDoc]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (q && !employeeName(e).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, statusFilter, search]);

  const missingRequired = useMemo(() => {
    if (!definition) return [];
    return definition.fields.filter((f) => {
      if (!f.required) return false;
      const v = formValues[f.key];
      return v === undefined || v === "" || v === null;
    });
  }, [definition, formValues]);

  async function download(format: "pdf" | "docx") {
    if (!selectedEmployeeId || !definition || missingRequired.length > 0) return;
    setGenerating(format);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          documentType: typeCode,
          format,
          params: formValues,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `document.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Document généré : ${filename}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="flex gap-4 items-start">
      <div className="card w-72 shrink-0">
        <p className="font-bold mb-3">Employés ({filteredEmployees.length})</p>
        <input
          className="input mb-2"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input mb-3"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EmployeeStatus | "all")}
        >
          <option value="active">Actifs</option>
          <option value="on_leave">En congé</option>
          <option value="terminated">Sortis</option>
          <option value="all">Tous</option>
        </select>

        {loadingEmployees ? (
          <SkeletonRows rows={4} cols={1} />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto -mx-1">
            {filteredEmployees.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedEmployeeId(e.id)}
                className={`w-full text-left rounded-xl px-3 py-2 text-sm mb-1 ${
                  selectedEmployeeId === e.id
                    ? "bg-slate-900 text-white font-bold"
                    : "hover:bg-slate-50 text-slate-600"
                }`}
              >
                {employeeName(e)}
                <span className="block text-xs opacity-60">
                  {e.category === "bureau" ? "Bureau" : "Chantier"}
                </span>
              </button>
            ))}
            {filteredEmployees.length === 0 && (
              <p className="text-sm text-slate-400 px-1">Aucun résultat.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 card">
        {!selectedEmployeeId ? (
          <p className="text-slate-400">Sélectionnez un employé à gauche.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-lg">
                {employeeDoc ? employeeDoc.fullNameUpper : "…"}
              </p>
              <select
                className="input w-auto"
                value={typeCode}
                onChange={(e) => setTypeCode(e.target.value)}
              >
                {DOCUMENT_TYPES.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {definition?.legalRisk && (
              <div className="rounded-xl bg-warning-50 border border-warning-200 text-warning-800 text-sm px-3 py-2 mb-4">
                Brouillon — à vérifier avant envoi. Ce document engage l&apos;entreprise ;
                relisez-le (et faites-le relire si besoin) avant signature ou envoi au
                salarié.
              </div>
            )}

            {loadingDetail || !employeeDoc || !companyDoc ? (
              <p className="text-slate-400">Chargement des données de l&apos;employé…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {definition?.fields.map((f) => (
                    <label
                      key={f.key}
                      className={`text-sm font-bold ${
                        f.type === "textarea" ? "col-span-2" : ""
                      }`}
                    >
                      {f.label}
                      {f.required && <span className="text-error-500"> *</span>}
                      {f.type === "boolean" ? (
                        <div className="mt-2">
                          <input
                            type="checkbox"
                            checked={Boolean(formValues[f.key])}
                            onChange={(ev) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [f.key]: ev.target.checked,
                              }))
                            }
                          />
                        </div>
                      ) : f.type === "textarea" ? (
                        <textarea
                          className="input mt-2 min-h-24"
                          value={String(formValues[f.key] ?? "")}
                          onChange={(ev) =>
                            setFormValues((prev) => ({ ...prev, [f.key]: ev.target.value }))
                          }
                        />
                      ) : f.type === "select" ? (
                        <select
                          className="input mt-2"
                          value={String(formValues[f.key] ?? "")}
                          onChange={(ev) =>
                            setFormValues((prev) => ({ ...prev, [f.key]: ev.target.value }))
                          }
                        >
                          <option value="">—</option>
                          {f.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input mt-2"
                          type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                          value={String(formValues[f.key] ?? "")}
                          onChange={(ev) =>
                            setFormValues((prev) => ({
                              ...prev,
                              [f.key]:
                                f.type === "number"
                                  ? ev.target.value === ""
                                    ? ""
                                    : Number(ev.target.value)
                                  : ev.target.value,
                            }))
                          }
                        />
                      )}
                      {f.help && (
                        <span className="block text-xs font-normal text-slate-400 mt-1">
                          {f.help}
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                {missingRequired.length > 0 && (
                  <p className="text-sm text-error-500 mb-3">
                    Champs obligatoires manquants :{" "}
                    {missingRequired.map((f) => f.label).join(", ")}
                  </p>
                )}
                {errorMsg && <p className="text-sm text-error-500 mb-3">{errorMsg}</p>}

                <div className="flex gap-3">
                  <button
                    className="btn btn-dark"
                    disabled={missingRequired.length > 0 || generating !== null}
                    onClick={() => download("docx")}
                  >
                    {generating === "docx" ? "Génération…" : "Télécharger Word (.docx)"}
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={missingRequired.length > 0 || generating !== null}
                    onClick={() => download("pdf")}
                  >
                    {generating === "pdf" ? "Génération…" : "Télécharger PDF"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Vue "Registre du personnel" — copie fidèle du Registre unique du personnel ──
type RegistreRow = {
  id: string;
  numero: number | null;
  nom_prenom: string;
  date_entree: string | null;
  nationalite: string | null;
  date_naissance: string | null;
  sexe: string | null;
  emploi: string | null;
  qualification: string | null;
  type_titre: string | null;
  numero_titre: string | null;
  type_contrat: string | null;
  temps_partiel: string | null;
  date_sortie: string | null;
};

type RegistreEditForm = {
  numero: string;
  nom_prenom: string;
  date_entree: string;
  nationalite: string;
  date_naissance: string;
  sexe: string;
  emploi: string;
  qualification: string;
  type_titre: string;
  numero_titre: string;
  type_contrat: string;
  temps_partiel: string;
  date_sortie: string;
};

// EU/EEA/Switzerland nationals don't need a work permit in France — only nationalities
// outside this list should be flagged as needing a titre de séjour/travail check.

function toRegistreEditForm(r: RegistreRow): RegistreEditForm {
  return {
    numero: r.numero?.toString() ?? "",
    nom_prenom: r.nom_prenom,
    date_entree: r.date_entree ?? "",
    nationalite: r.nationalite ?? "",
    date_naissance: r.date_naissance ?? "",
    sexe: r.sexe ?? "",
    emploi: r.emploi ?? "",
    qualification: r.qualification ?? "",
    type_titre: r.type_titre ?? "",
    numero_titre: r.numero_titre ?? "",
    type_contrat: r.type_contrat ?? "",
    temps_partiel: r.temps_partiel ?? "",
    date_sortie: r.date_sortie ?? "",
  };
}

function validateRegistreEditForm(form: RegistreEditForm): string[] {
  const errors: string[] = [];
  if (!form.nom_prenom.trim()) errors.push("« Nom Prénom » est obligatoire.");
  if (form.numero && (!/^\d+$/.test(form.numero) || Number(form.numero) <= 0)) {
    errors.push("« N° » doit être un entier positif.");
  }
  if (form.sexe && !["M", "F"].includes(form.sexe.trim().toUpperCase())) {
    errors.push("« Sexe » doit être M ou F.");
  }

  const dates: { label: string; value: string }[] = [
    { label: "Date d'entrée", value: form.date_entree },
    { label: "Date de naissance", value: form.date_naissance },
    { label: "Date de sortie", value: form.date_sortie },
  ];
  for (const { label, value } of dates) {
    if (value && isNaN(new Date(value).getTime())) errors.push(`« ${label} » n'est pas une date valide.`);
  }

  if (form.date_naissance && !isNaN(new Date(form.date_naissance).getTime())) {
    const ageYears = (Date.now() - new Date(form.date_naissance).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < 14 || ageYears > 100) {
      errors.push("« Date de naissance » donne un âge improbable (< 14 ou > 100 ans).");
    }
  }
  if (
    form.date_entree &&
    form.date_naissance &&
    !isNaN(new Date(form.date_entree).getTime()) &&
    !isNaN(new Date(form.date_naissance).getTime()) &&
    new Date(form.date_entree) < new Date(form.date_naissance)
  ) {
    errors.push("« Date d'entrée » précède « Date de naissance ».");
  }
  if (
    form.date_sortie &&
    form.date_entree &&
    !isNaN(new Date(form.date_sortie).getTime()) &&
    !isNaN(new Date(form.date_entree).getTime()) &&
    new Date(form.date_sortie) < new Date(form.date_entree)
  ) {
    errors.push("« Date de sortie » précède « Date d'entrée ».");
  }
  return errors;
}

const REGISTRE_FIELD_LABELS: { key: keyof RegistreEditForm; label: string; type: "text" | "date" | "select" }[] = [
  { key: "numero", label: "N°", type: "text" },
  { key: "nom_prenom", label: "Nom Prénom", type: "text" },
  { key: "date_entree", label: "Date d'entrée", type: "date" },
  { key: "nationalite", label: "Nationalité", type: "select" },
  { key: "date_naissance", label: "Date de naissance", type: "date" },
  { key: "sexe", label: "Sexe (M/F)", type: "select" },
  { key: "emploi", label: "Emploi", type: "text" },
  { key: "qualification", label: "Qualification", type: "text" },
  { key: "type_titre", label: "Type de titre", type: "select" },
  { key: "numero_titre", label: "N° du titre", type: "text" },
  { key: "type_contrat", label: "Type de contrat", type: "select" },
  { key: "temps_partiel", label: "Temps partiel", type: "text" },
  { key: "date_sortie", label: "Date de sortie", type: "date" },
];

const SEXE_SELECT_OPTIONS = ["M", "F"];
const CURATED_NATIONALITE_OPTIONS = [
  "France",
  "Ukraine",
  "Biélorussie",
  "Roumanie",
  "Moldavie",
  "Russie",
  "Lituanie",
  "Kazakhstan",
  "Pologne",
  "Portugal",
  "Maroc",
  "Algérie",
  "Tunisie",
  "Géorgie",
  "Arménie",
  "Azerbaïdjan",
];
const CURATED_TYPE_TITRE_OPTIONS = [
  "APS",
  "Titre de séjour",
  "VLS-TS salarié",
  "Carte de résident",
  "Carte de séjour pluriannuelle",
  "Passeport talent",
  "Récépissé de demande de titre de séjour",
];
const CURATED_TYPE_CONTRAT_OPTIONS = [
  "CDI",
  "CDD",
  "Intérim",
  "Apprentissage",
  "Contrat de professionnalisation",
  "Stage",
];

function RegistreView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [rows, setRows] = useState<RegistreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "present" | "sorti">("all");
  const [nationaliteFilter, setNationaliteFilter] = useState("all");
  const [sexeFilter, setSexeFilter] = useState<"all" | "M" | "F">("all");
  const [foreignersOnly, setForeignersOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RegistreEditForm | null>(null);
  const [editErrors, setEditErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("registre_unique_personnel")
        .select(
          "id, numero, nom_prenom, date_entree, nationalite, date_naissance, sexe, emploi, qualification, type_titre, numero_titre, type_contrat, temps_partiel, date_sortie"
        )
        .order("numero", { ascending: true });
      setRows((data as unknown as RegistreRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase, refreshKey]);

  const nationaliteOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.nationalite && set.add(r.nationalite));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const nationaliteSelectOptions = useMemo(() => {
    const set = new Set(CURATED_NATIONALITE_OPTIONS);
    rows.forEach((r) => r.nationalite && set.add(r.nationalite));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const typeTitreSelectOptions = useMemo(() => {
    const set = new Set(CURATED_TYPE_TITRE_OPTIONS);
    rows.forEach((r) => r.type_titre && set.add(r.type_titre));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const typeContratSelectOptions = useMemo(() => {
    const set = new Set(CURATED_TYPE_CONTRAT_OPTIONS);
    rows.forEach((r) => r.type_contrat && set.add(r.type_contrat));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  function registreSelectOptions(key: keyof RegistreEditForm): string[] {
    switch (key) {
      case "sexe":
        return SEXE_SELECT_OPTIONS;
      case "nationalite":
        return nationaliteSelectOptions;
      case "type_titre":
        return typeTitreSelectOptions;
      case "type_contrat":
        return typeContratSelectOptions;
      default:
        return [];
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "present" && r.date_sortie) return false;
      if (statusFilter === "sorti" && !r.date_sortie) return false;
      if (nationaliteFilter !== "all" && r.nationalite !== nationaliteFilter) return false;
      if (sexeFilter !== "all" && (r.sexe ?? "").toUpperCase() !== sexeFilter) return false;
      if (foreignersOnly && !isForeignNationality(r.nationalite)) return false;
      if (q && !r.nom_prenom.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, statusFilter, nationaliteFilter, sexeFilter, foreignersOnly]);

  const counts = useMemo(() => {
    const sorti = rows.filter((r) => r.date_sortie).length;
    const foreigners = rows.filter((r) => isForeignNationality(r.nationalite)).length;
    return { total: rows.length, present: rows.length - sorti, sorti, foreigners };
  }, [rows]);

  function startEdit(r: RegistreRow) {
    setEditingId(r.id);
    setEditForm(toRegistreEditForm(r));
    setEditErrors([]);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
    setEditErrors([]);
  }

  async function saveEdit() {
    if (!editingId || !editForm) return;
    const errors = validateRegistreEditForm(editForm);
    if (errors.length > 0) {
      setEditErrors(errors);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("registre_unique_personnel")
      .update({
        numero: editForm.numero ? Number(editForm.numero) : null,
        nom_prenom: editForm.nom_prenom.trim(),
        date_entree: editForm.date_entree || null,
        nationalite: editForm.nationalite.trim() || null,
        date_naissance: editForm.date_naissance || null,
        sexe: editForm.sexe.trim().toUpperCase() || null,
        emploi: editForm.emploi.trim() || null,
        qualification: editForm.qualification.trim() || null,
        type_titre: editForm.type_titre.trim() || null,
        numero_titre: editForm.numero_titre.trim() || null,
        type_contrat: editForm.type_contrat.trim() || null,
        temps_partiel: editForm.temps_partiel.trim() || null,
        date_sortie: editForm.date_sortie || null,
      })
      .eq("id", editingId);
    setSaving(false);

    if (error) {
      setEditErrors([`Erreur d'enregistrement : ${error.message}`]);
      return;
    }
    cancelEdit();
    setRefreshKey((k) => k + 1);
    toast.success("Enregistrement mis à jour");
  }

  function exportExcel() {
    const exportRows = filtered.map((r) => ({
      "N°": r.numero,
      "Nom Prénom": r.nom_prenom,
      "Date d'entrée": r.date_entree,
      Nationalité: r.nationalite,
      "Date de naissance": r.date_naissance,
      Sexe: r.sexe,
      Emploi: r.emploi,
      Qualification: r.qualification,
      "Type de titre": r.type_titre,
      "N° du titre": r.numero_titre,
      "Type de contrat": r.type_contrat,
      "Temps partiel": r.temps_partiel,
      "Date de sortie": r.date_sortie,
    }));
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Registre unique du personnel");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "registre_unique_du_personnel.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="font-bold">
            Registre unique du personnel ({filtered.length}/{counts.total})
          </p>
          <button className="btn btn-dark text-sm px-3 py-2" onClick={exportExcel}>
            Exporter Excel
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Copie fidèle du registre — un enregistrement par embauche (un salarié réembauché
          apparaît plusieurs fois). Les lignes surlignées correspondent aux salariés de
          nationalité étrangère.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            {counts.total} au total
          </button>
          <button
            onClick={() => setStatusFilter("present")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "present" ? "bg-success-600 text-white" : "bg-success-50 text-success-700"
            }`}
          >
            {counts.present} sans date de sortie
          </button>
          <button
            onClick={() => setStatusFilter("sorti")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "sorti" ? "bg-error-600 text-white" : "bg-error-50 text-error-700"
            }`}
          >
            {counts.sorti} sortis
          </button>
          <button
            onClick={() => setForeignersOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              foreignersOnly ? "bg-warning-600 text-white" : "bg-warning-50 text-warning-700"
            }`}
          >
            {counts.foreigners} étrangers
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="input"
            placeholder="Rechercher un nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input"
            value={nationaliteFilter}
            onChange={(e) => setNationaliteFilter(e.target.value)}
          >
            <option value="all">Toutes nationalités</option>
            {nationaliteOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={sexeFilter}
            onChange={(e) => setSexeFilter(e.target.value as "all" | "M" | "F")}
          >
            <option value="all">Tous sexes</option>
            <option value="M">Homme</option>
            <option value="F">Femme</option>
          </select>
        </div>
      </div>

      <Modal open={!!(editingId && editForm)} onClose={cancelEdit} title="Modifier l'enregistrement" maxWidth="max-w-3xl">
        {editForm && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {REGISTRE_FIELD_LABELS.map((f) => (
                <label key={f.key} className="text-xs font-bold text-slate-500">
                  {f.label}
                  {f.type === "select" ? (
                    <select
                      className="input mt-1"
                      value={editForm[f.key]}
                      onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                    >
                      <option value="">—</option>
                      {registreSelectOptions(f.key).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input mt-1"
                      type={f.type}
                      value={editForm[f.key]}
                      onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            </div>
            {editErrors.length > 0 && (
              <div className="mt-3 rounded-xl bg-error-50 border border-error-200 text-error-600 text-sm px-3 py-2">
                {editErrors.map((err) => (
                  <p key={err}>{err}</p>
                ))}
              </div>
            )}
            <div className="flex gap-3 mt-4">
              <button className="btn btn-green text-sm px-3 py-2" disabled={saving} onClick={saveEdit}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button className="btn btn-secondary text-sm px-3 py-2" onClick={cancelEdit}>
                Annuler
              </button>
            </div>
          </>
        )}
      </Modal>

      {loading ? (
        <div className="card">
          <SkeletonRows rows={6} cols={6} />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 whitespace-nowrap">
                <th className="py-2 pr-4">N°</th>
                <th className="py-2 pr-4">Nom Prénom</th>
                <th className="py-2 pr-4">Date d&apos;entrée</th>
                <th className="py-2 pr-4">Nationalité</th>
                <th className="py-2 pr-4">Date de naissance</th>
                <th className="py-2 pr-4">Sexe</th>
                <th className="py-2 pr-4">Emploi</th>
                <th className="py-2 pr-4">Qualification</th>
                <th className="py-2 pr-4">Type de titre</th>
                <th className="py-2 pr-4">N° du titre</th>
                <th className="py-2 pr-4">Type de contrat</th>
                <th className="py-2 pr-4">Temps partiel</th>
                <th className="py-2 pr-4">Date de sortie</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const foreign = isForeignNationality(r.nationalite);
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-slate-100 ${foreign ? "bg-warning-50" : ""}`}
                  >
                    <td className="py-2 pr-4 text-slate-400 whitespace-nowrap">{r.numero ?? "—"}</td>
                    <td className="py-2 pr-4 font-bold whitespace-nowrap">{r.nom_prenom}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.date_entree ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.nationalite ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.date_naissance ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.sexe ?? "—"}</td>
                    <td className="py-2 pr-4 min-w-[16rem]">{r.emploi ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.qualification ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.type_titre ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.numero_titre ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.type_contrat ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.temps_partiel ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{r.date_sortie ?? "—"}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <button
                        className="text-xs text-slate-400 underline"
                        onClick={() => startEdit(r)}
                      >
                        Modifier
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="py-6 text-center text-slate-400">
                    Aucun résultat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Vue "Organigramme" — dérivée en direct des rôles bureau et des équipes ──
const BUREAU_ROLE_LABELS: Record<string, string> = {
  boss: "Boss",
  rh: "RH",
  assistant: "Assistante de direction",
  coach: "Coach",
  production: "Production",
  planning: "Planning",
  comptable: "Comptable",
  marketing: "Marketing",
  control: "Contrôle qualité",
  formation_officer: "Formation",
  depot: "Dépôt",
  hotel: "Hôtel",
  logement: "Logement",
};
const BUREAU_ROLE_ORDER = Object.keys(BUREAU_ROLE_LABELS);

type OrgEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  category: "bureau" | "chantier";
  bureau_role: string | null;
  team_id: string | null;
  teams: { name: string } | null;
};

type OrgTeam = { id: string; name: string };

/** Groups employees into fixed columns (one per role/team id) and pads every column to
 *  the same row count so the whole thing renders as a rectangular <table>. */
function buildOrgGrid(
  columns: { key: string; label: string }[],
  columnOf: (e: OrgEmployee) => string | null,
  employees: OrgEmployee[]
) {
  const byColumn = new Map<string, OrgEmployee[]>();
  columns.forEach((c) => byColumn.set(c.key, []));
  employees.forEach((e) => {
    const key = columnOf(e);
    if (key && byColumn.has(key)) byColumn.get(key)!.push(e);
  });
  const maxRows = Math.max(0, ...Array.from(byColumn.values()).map((v) => v.length));
  const rows: (OrgEmployee | null)[][] = Array.from({ length: maxRows }, (_, r) =>
    columns.map((c) => byColumn.get(c.key)![r] ?? null)
  );
  return { byColumn, rows, maxRows };
}

function OrganigrammeView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [employees, setEmployees] = useState<OrgEmployee[]>([]);
  const [teams, setTeams] = useState<OrgTeam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: emp }, { data: tm }] = await Promise.all([
        supabase
          .from("employees")
          .select(
            "id, first_name, last_name, category, bureau_role, team_id, teams!employees_team_id_fkey(name)"
          )
          .eq("status", "active")
          .order("last_name"),
        supabase.from("teams").select("id, name").eq("active", true).order("name"),
      ]);
      setEmployees((emp as unknown as OrgEmployee[]) ?? []);
      setTeams((tm as OrgTeam[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const bureauEmployees = useMemo(() => employees.filter((e) => e.category === "bureau"), [employees]);
  const chantierEmployees = useMemo(() => employees.filter((e) => e.category === "chantier"), [employees]);

  const teamColumns = useMemo(
    () =>
      [...teams]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((t) => ({ key: t.id, label: t.name })),
    [teams]
  );
  const bureauColumns = useMemo(
    () => BUREAU_ROLE_ORDER.map((role) => ({ key: role, label: BUREAU_ROLE_LABELS[role] })),
    []
  );

  const bureauGrid = useMemo(
    () => buildOrgGrid(bureauColumns, (e) => e.bureau_role, bureauEmployees),
    [bureauColumns, bureauEmployees]
  );
  const teamGrid = useMemo(
    () => buildOrgGrid(teamColumns, (e) => e.team_id, chantierEmployees),
    [teamColumns, chantierEmployees]
  );

  const unassignedBureau = useMemo(
    () => bureauEmployees.filter((e) => !e.bureau_role),
    [bureauEmployees]
  );
  const unassignedChantier = useMemo(
    () => chantierEmployees.filter((e) => !e.team_id),
    [chantierEmployees]
  );

  if (loading)
    return (
      <div className="card">
        <SkeletonRows rows={5} cols={5} />
      </div>
    );

  return (
    <div>
      <div className="card mb-4 overflow-x-auto">
        <p className="font-bold mb-3">Bureau</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 whitespace-nowrap">
              {bureauColumns.map((c) => (
                <th key={c.key} className="py-2 pr-4">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bureauGrid.rows.map((row, r) => (
              <tr key={r} className="border-t border-slate-100">
                {row.map((e, c) => (
                  <td key={bureauColumns[c].key} className="py-2 pr-4 whitespace-nowrap font-bold">
                    {e ? employeeName(e) : ""}
                  </td>
                ))}
              </tr>
            ))}
            {bureauGrid.maxRows === 0 && (
              <tr>
                <td colSpan={bureauColumns.length} className="py-6 text-center text-slate-400">
                  Aucun résultat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card mb-4 overflow-x-auto">
        <p className="font-bold mb-3">Chantier — par équipe</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 whitespace-nowrap">
              {teamColumns.map((c) => (
                <th key={c.key} className="py-2 pr-4">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teamGrid.rows.map((row, r) => (
              <tr key={r} className="border-t border-slate-100">
                {row.map((e, c) => (
                  <td key={teamColumns[c].key} className="py-2 pr-4 whitespace-nowrap">
                    {e ? employeeName(e) : ""}
                  </td>
                ))}
              </tr>
            ))}
            {teamGrid.maxRows === 0 && (
              <tr>
                <td colSpan={teamColumns.length} className="py-6 text-center text-slate-400">
                  Aucun résultat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(unassignedBureau.length > 0 || unassignedChantier.length > 0) && (
        <div className="card">
          <p className="font-bold mb-2 text-error-500">
            Sans rôle ni équipe ({unassignedBureau.length + unassignedChantier.length})
          </p>
          {[...unassignedBureau, ...unassignedChantier].map((e) => (
            <p key={e.id} className="text-sm">
              {employeeName(e)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vue "Cours de français" — présence par séance ──────────────────────────
type FrenchStudent = { employee_id: string; employees: { first_name: string; last_name: string } };
type FrenchSession = { id: string; session_date: string };
type FrenchAttendance = {
  session_id: string;
  employee_id: string;
  absent: boolean | null;
  homework_done: boolean | null;
  control_done: boolean | null;
};

function FrancaisView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [students, setStudents] = useState<FrenchStudent[]>([]);
  const [sessions, setSessions] = useState<FrenchSession[]>([]);
  const [attendance, setAttendance] = useState<FrenchAttendance[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: studentRows }, { data: sessionRows }] = await Promise.all([
        supabase
          .from("french_class_students")
          .select("employee_id, employees(first_name, last_name)")
          .order("employees(last_name)"),
        supabase.from("french_class_sessions").select("id, session_date").order("session_date"),
      ]);
      setStudents((studentRows as unknown as FrenchStudent[]) ?? []);
      const sessionList = (sessionRows as unknown as FrenchSession[]) ?? [];
      setSessions(sessionList);

      const todayStr = today();
      const defaultSession =
        sessionList.find((s) => s.session_date >= todayStr) ?? sessionList[sessionList.length - 1];
      setSessionId(defaultSession?.id ?? "");
      setLoading(false);
    }
    load();
  }, [supabase]);

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setAttendance([]);
        return;
      }
      const { data } = await supabase
        .from("french_class_attendance")
        .select("session_id, employee_id, absent, homework_done, control_done")
        .eq("session_id", sessionId);
      setAttendance((data as unknown as FrenchAttendance[]) ?? []);
    }
    load();
  }, [supabase, sessionId]);

  const attendanceByEmployee = useMemo(() => {
    const map = new Map<string, FrenchAttendance>();
    attendance.forEach((a) => map.set(a.employee_id, a));
    return map;
  }, [attendance]);

  async function toggle(
    employeeId: string,
    field: "absent" | "homework_done" | "control_done",
    value: boolean
  ) {
    if (!sessionId) return;
    setSaving(true);
    const current = attendanceByEmployee.get(employeeId);
    const payload = {
      session_id: sessionId,
      employee_id: employeeId,
      absent: current?.absent ?? null,
      homework_done: current?.homework_done ?? null,
      control_done: current?.control_done ?? null,
      [field]: value,
    };
    const { error } = await supabase
      .from("french_class_attendance")
      .upsert(payload, { onConflict: "session_id,employee_id" });
    setSaving(false);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    setAttendance((prev) => {
      const others = prev.filter((a) => a.employee_id !== employeeId);
      return [...others, payload];
    });
  }

  if (loading)
    return (
      <div className="card">
        <SkeletonRows rows={5} cols={5} />
      </div>
    );

  if (sessions.length === 0) {
    return (
      <p className="card text-center text-slate-400">
        Aucune séance programmée. Exécutez la migration des cours de français pour importer le
        calendrier.
      </p>
    );
  }

  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="font-bold text-sm">
          Séance
          <select
            className="input mt-2"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {formatDateShortDMY(s.session_date)}
              </option>
            ))}
          </select>
        </label>
        {saving && <span className="text-xs text-slate-400">Enregistrement…</span>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-2 pr-4">Élève</th>
              <th className="py-2 pr-4">Absent (Н)</th>
              <th className="py-2 pr-4">Devoir fait (ДЗ)</th>
              <th className="py-2 pr-4">Contrôle (К)</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const a = attendanceByEmployee.get(s.employee_id);
              return (
                <tr key={s.employee_id} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-bold">{employeeName(s.employees)}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      checked={a?.absent ?? false}
                      onChange={(ev) => toggle(s.employee_id, "absent", ev.target.checked)}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      checked={a?.homework_done ?? false}
                      onChange={(ev) => toggle(s.employee_id, "homework_done", ev.target.checked)}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      checked={a?.control_done ?? false}
                      onChange={(ev) => toggle(s.employee_id, "control_done", ev.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDateShortDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── Vue "Paie" — table de saisie net→brut (repas → HS+25% → HS+50% → prime) ──
type PaieEmployee = { id: string; first_name: string; last_name: string };

type PaieLineInput = {
  netSouhaite: string;
  majJoursFeries: string;
  joursRepas: string;
};

const EMPTY_PAIE_LINE: PaieLineInput = { netSouhaite: "", majJoursFeries: "", joursRepas: "" };

function PaieView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<PaieEmployee[]>([]);
  const [params, setParams] = useState<PayrollParams>(DEFAULT_PAYROLL_PARAMS);
  const [runId, setRunId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, PaieLineInput>>({});
  const [showParams, setShowParams] = useState(false);
  const [holidayBonusSelection, setHolidayBonusSelection] = useState("");
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setHolidayBonusSelection("");
      const monthIso = `${year}-${String(month).padStart(2, "0")}-01`;

      const [{ data: emp }, { data: paramRow }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, first_name, last_name")
          .eq("status", "active")
          .order("last_name"),
        supabase.from("payroll_parameters").select("*").limit(1).maybeSingle(),
      ]);
      setEmployees((emp as PaieEmployee[]) ?? []);
      if (paramRow) {
        setParams({
          tauxHoraireBase: Number(paramRow.taux_horaire_base),
          heuresNormalesMois: Number(paramRow.heures_normales_mois),
          majorationHs25: Number(paramRow.majoration_hs25),
          majorationHs50: Number(paramRow.majoration_hs50),
          tauxRetenues: Number(paramRow.taux_retenues),
          exonerationHsFixe: Number(paramRow.exoneration_hs_fixe),
          tarifRepasJour: Number(paramRow.tarif_repas_jour),
          maxJoursRepas: Number(paramRow.max_jours_repas),
          maxHs25Heures: Number(paramRow.max_hs25_heures),
          maxHs50Heures: Number(paramRow.max_hs50_heures),
          majorationJourFerie:
            paramRow.majoration_jour_ferie != null
              ? Number(paramRow.majoration_jour_ferie)
              : DEFAULT_PAYROLL_PARAMS.majorationJourFerie,
        });
      }

      let { data: run } = await supabase
        .from("payroll_runs")
        .select("id")
        .eq("month", monthIso)
        .maybeSingle();
      if (!run) {
        const { data: created } = await supabase
          .from("payroll_runs")
          .insert({ month: monthIso })
          .select("id")
          .single();
        run = created;
      }
      setRunId(run?.id ?? null);

      // "Max jours repas" is the usual reimbursement reference (22, per the
      // source spreadsheet), not a hard ceiling — some months genuinely have
      // more working days than that, so the default shouldn't clip below the
      // real calendar count.
      const defaultJoursRepas = String(countWorkingDaysInMonth(year, month));

      if (run?.id) {
        const { data: lines } = await supabase
          .from("payroll_line_items")
          .select("employee_id, net_souhaite, maj_jours_feries, jours_repas")
          .eq("run_id", run.id);
        const savedByEmployee = new Map((lines ?? []).map((l) => [l.employee_id, l]));
        const map: Record<string, PaieLineInput> = {};
        (emp ?? []).forEach((e) => {
          const l = savedByEmployee.get(e.id);
          map[e.id] = {
            netSouhaite: l?.net_souhaite ? String(l.net_souhaite) : "",
            majJoursFeries: l?.maj_jours_feries ? String(l.maj_jours_feries) : "",
            // No saved line yet for this employee this month — suggest the
            // computed working-day count instead of leaving it blank.
            joursRepas: l ? String(l.jours_repas ?? 0) : defaultJoursRepas,
          };
        });
        setInputs(map);
      } else {
        const map: Record<string, PaieLineInput> = {};
        (emp ?? []).forEach((e) => {
          map[e.id] = { ...EMPTY_PAIE_LINE, joursRepas: defaultJoursRepas };
        });
        setInputs(map);
      }

      setLoading(false);
    }
    load();
  }, [supabase, year, month]);

  const workingDaysInMonth = useMemo(() => countWorkingDaysInMonth(year, month), [year, month]);
  const monthHolidays = useMemo(() => frenchHolidaysInMonth(year, month), [year, month]);
  // Suggested bonus for working a public holiday: majorationJourFerie% of one
  // standard day's base pay (35h/5j week, per the reference workbook's params;
  // its own column note read "jours fériés réellement travaillés × taux ×
  // 100%"). Not a verified formula — the source spreadsheet always had this as
  // a blank, hand-typed field — just a starting point RH can override per
  // employee.
  const holidayDailyBaseRate = useMemo(() => {
    const weeklyHours = (params.heuresNormalesMois * 12) / 52;
    const dailyHours = weeklyHours / 5;
    return dailyHours * params.tauxHoraireBase;
  }, [params]);
  const holidayMajorationPercent = params.majorationJourFerie * 100;
  const holidayDailyBonus = Math.round(holidayDailyBaseRate * params.majorationJourFerie * 100) / 100;

  function applyWorkingDaysToAll() {
    const defaultJoursRepas = String(workingDaysInMonth);
    setInputs((prev) => {
      const next = { ...prev };
      employees.forEach((e) => {
        next[e.id] = { ...(next[e.id] ?? EMPTY_PAIE_LINE), joursRepas: defaultJoursRepas };
      });
      return next;
    });
  }

  function applyHolidayBonusToAll() {
    if (!holidayBonusSelection) return;
    setInputs((prev) => {
      const next = { ...prev };
      employees.forEach((e) => {
        next[e.id] = { ...(next[e.id] ?? EMPTY_PAIE_LINE), majJoursFeries: holidayBonusSelection };
      });
      return next;
    });
  }

  function updateInput(employeeId: string, field: keyof PaieLineInput, value: string) {
    setInputs((prev) => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] ?? EMPTY_PAIE_LINE), [field]: value },
    }));
  }

  const computed = useMemo(() => {
    const map: Record<string, ReturnType<typeof computePayrollLine>> = {};
    employees.forEach((e) => {
      const line = inputs[e.id] ?? EMPTY_PAIE_LINE;
      map[e.id] = computePayrollLine(
        {
          netSouhaite: Number(line.netSouhaite) || 0,
          majJoursFeries: Number(line.majJoursFeries) || 0,
          joursRepas: Number(line.joursRepas) || 0,
        },
        params
      );
    });
    return map;
  }, [employees, inputs, params]);

  const totals = useMemo(() => {
    return employees.reduce(
      (acc, e) => {
        const line = inputs[e.id] ?? EMPTY_PAIE_LINE;
        const c = computed[e.id];
        acc.netSouhaite += Number(line.netSouhaite) || 0;
        acc.majJoursFeries += Number(line.majJoursFeries) || 0;
        acc.joursRepas += Number(line.joursRepas) || 0;
        acc.hs25Heures += c?.hs25Heures ?? 0;
        acc.hs50Heures += c?.hs50Heures ?? 0;
        acc.primeExceptionnelle += c?.primeExceptionnelle ?? 0;
        return acc;
      },
      { netSouhaite: 0, majJoursFeries: 0, joursRepas: 0, hs25Heures: 0, hs50Heures: 0, primeExceptionnelle: 0 }
    );
  }, [employees, inputs, computed]);

  async function save() {
    if (!runId) return;
    setSaving(true);
    const rows = employees.map((e) => {
      const line = inputs[e.id] ?? EMPTY_PAIE_LINE;
      const c = computed[e.id];
      return {
        run_id: runId,
        employee_id: e.id,
        net_souhaite: Number(line.netSouhaite) || 0,
        maj_jours_feries: Number(line.majJoursFeries) || 0,
        jours_repas: Number(line.joursRepas) || 0,
        hs25_heures: c?.hs25Heures ?? 0,
        hs50_heures: c?.hs50Heures ?? 0,
        prime_exceptionnelle: c?.primeExceptionnelle ?? 0,
      };
    });
    const { error } = await supabase
      .from("payroll_line_items")
      .upsert(rows, { onConflict: "run_id,employee_id" });
    setSaving(false);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.success("Paie enregistrée");
  }

  function exportExcel() {
    const exportRows = employees.map((e, i) => {
      const line = inputs[e.id] ?? EMPTY_PAIE_LINE;
      const c = computed[e.id];
      return {
        "#": i + 1,
        "Nom Prénom": employeeName(e),
        "Net souhaité €": Number(line.netSouhaite) || 0,
        "Maj. jours fériés €": Number(line.majJoursFeries) || 0,
        "Jours repas": Number(line.joursRepas) || 0,
        "HS+25% h": c?.hs25Heures ?? 0,
        "HS+50% h": c?.hs50Heures ?? 0,
        "Prime except. €": c?.primeExceptionnelle ?? 0,
      };
    });
    exportRows.push({
      "#": 0,
      "Nom Prénom": "TOTAL",
      "Net souhaité €": Math.round(totals.netSouhaite * 100) / 100,
      "Maj. jours fériés €": Math.round(totals.majJoursFeries * 100) / 100,
      "Jours repas": totals.joursRepas,
      "HS+25% h": totals.hs25Heures,
      "HS+50% h": totals.hs50Heures,
      "Prime except. €": Math.round(totals.primeExceptionnelle * 100) / 100,
    });
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Paie");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paie_${year}-${String(month).padStart(2, "0")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Replaces each already-logged day's overtime_minutes with an even split of
  // this month's computed HS+25%/HS+50% total — pointage_entries doesn't track
  // the 25%/50% split per day, only a single overtime figure, so both get
  // combined before distributing. Employees with no pointage entry this month
  // are skipped (nothing to distribute across) and reported back.
  async function syncHoursToPointage() {
    setSyncing(true);
    const { start, end } = monthRange(year, month);
    let updatedCount = 0;
    const skipped: string[] = [];

    for (const e of employees) {
      const c = computed[e.id];
      const totalHsMinutes = Math.round(((c?.hs25Heures ?? 0) + (c?.hs50Heures ?? 0)) * 60);
      if (totalHsMinutes === 0) continue;

      const { data: rows } = await supabase
        .from("pointage_entries")
        .select("id")
        .eq("employee_id", e.id)
        .eq("is_absent", false)
        .gte("work_date", start)
        .lte("work_date", end)
        .order("work_date");

      if (!rows || rows.length === 0) {
        skipped.push(employeeName(e));
        continue;
      }

      const n = rows.length;
      const base = Math.floor(totalHsMinutes / n);
      const remainder = totalHsMinutes % n;
      const results = await Promise.all(
        rows.map((r, i) =>
          supabase
            .from("pointage_entries")
            .update({ overtime_minutes: base + (i < remainder ? 1 : 0) })
            .eq("id", r.id)
        )
      );
      if (results.some((r) => r.error)) {
        toast.error(`Erreur pour ${employeeName(e)} : ${results.find((r) => r.error)?.error?.message}`);
        continue;
      }
      updatedCount++;
    }

    setSyncing(false);
    setShowSyncModal(false);
    if (skipped.length > 0) {
      toast.warning(
        `${updatedCount} employé(s) mis à jour. Ignorés (aucune journée pointée ce mois) : ${skipped.join(", ")}`
      );
    } else {
      toast.success(`Heures HS réparties dans le pointage de ${updatedCount} employé(s).`);
    }
  }

  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4 items-end">
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
        <div className="flex gap-3">
          <button className="btn btn-secondary text-sm" onClick={() => setShowParams((s) => !s)}>
            Paramètres de calcul
          </button>
          <button className="btn btn-secondary text-sm" onClick={exportExcel}>
            <FileSpreadsheet size={15} /> Exporter Excel
          </button>
          <button className="btn btn-primary text-sm" disabled={saving} onClick={save}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button className="btn btn-dark text-sm" onClick={() => setShowSyncModal(true)}>
            <RefreshCw size={15} /> Appliquer au pointage
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-bold">{workingDaysInMonth} jours ouvrés</span>
            <span className="text-slate-400"> ce mois-ci — utilisé comme valeur par défaut pour « Jours repas ».</span>
          </p>
          <button className="btn btn-secondary text-xs px-3 py-1.5" onClick={applyWorkingDaysToAll}>
            Appliquer à tous
          </button>
        </div>
        {monthHolidays.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              {monthHolidays.map((h) => (
                <span key={h.date} className="badge badge-primary">
                  {h.label} — {weekdayLabelFr(h.date)} {h.date.slice(8, 10)}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
              <p className="text-sm text-slate-500">
                Majoration jour férié suggérée :{" "}
                <span className="font-bold text-slate-700">
                  {holidayMajorationPercent}% d&apos;une journée de base ({holidayDailyBonus.toFixed(2)} €)
                </span>{" "}
                / jour travaillé
              </p>
              <select
                className="input text-xs"
                style={{ width: "auto" }}
                value={holidayBonusSelection}
                onChange={(e) => setHolidayBonusSelection(e.target.value)}
              >
                <option value="">Choisir un jour férié…</option>
                {monthHolidays.map((h) => (
                  <option key={h.date} value={holidayDailyBonus}>
                    {h.label} — {holidayMajorationPercent}% ({holidayDailyBonus.toFixed(2)} €)
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary text-xs px-3 py-1.5"
                disabled={!holidayBonusSelection}
                onClick={applyHolidayBonusToAll}
              >
                Appliquer à tous
              </button>
            </div>
          </>
        )}
      </div>

      {showParams && (
        <div className="card mb-4">
          <p className="font-bold mb-3">Paramètres de calcul</p>
          <p className="text-xs text-slate-400 mb-3">
            Ces valeurs viennent du classeur Excel de référence. À ajuster seulement si le taux
            horaire, le SMIC ou les cotisations changent — le calcul ci-dessous s&apos;appuiera
            immédiatement sur les nouvelles valeurs.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <p>
              Taux horaire base <span className="block font-bold">{params.tauxHoraireBase} €/h</span>
            </p>
            <p>
              Heures normales/mois <span className="block font-bold">{params.heuresNormalesMois} h</span>
            </p>
            <p>
              Majoration HS+25% <span className="block font-bold">{params.majorationHs25 * 100}%</span>
            </p>
            <p>
              Majoration HS+50% <span className="block font-bold">{params.majorationHs50 * 100}%</span>
            </p>
            <p>
              Majoration jour férié <span className="block font-bold">{params.majorationJourFerie * 100}%</span>
            </p>
            <p>
              Tarif repas/jour <span className="block font-bold">{params.tarifRepasJour} €</span>
            </p>
            <p>
              Max jours repas/mois <span className="block font-bold">{params.maxJoursRepas}</span>
            </p>
            <p>
              Max HS+25% h/mois <span className="block font-bold">{params.maxHs25Heures} h</span>
            </p>
            <p>
              Max HS+50% h/mois <span className="block font-bold">{params.maxHs50Heures} h</span>
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <SkeletonRows rows={6} cols={7} />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 whitespace-nowrap">
                <th className="py-2 pr-4">Nom Prénom</th>
                <th className="py-2 pr-4 text-warning-700">Net souhaité €</th>
                <th className="py-2 pr-4 text-warning-700">Maj. jours fériés €</th>
                <th className="py-2 pr-4 text-warning-700">Jours repas</th>
                <th className="py-2 pr-4 text-primary-600">HS+25% h</th>
                <th className="py-2 pr-4 text-primary-600">HS+50% h</th>
                <th className="py-2 pr-4 text-primary-600">Prime except. €</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const line = inputs[e.id] ?? EMPTY_PAIE_LINE;
                const c = computed[e.id];
                return (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-semibold whitespace-nowrap">{employeeName(e)}</td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        className="input bg-warning-50/60"
                        style={{ width: "8rem" }}
                        value={line.netSouhaite}
                        onChange={(ev) => updateInput(e.id, "netSouhaite", ev.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        className="input bg-warning-50/60"
                        style={{ width: "11rem" }}
                        value={line.majJoursFeries}
                        onChange={(ev) => updateInput(e.id, "majJoursFeries", ev.target.value)}
                      >
                        <option value="">0 (aucun)</option>
                        {monthHolidays.map((h) => (
                          <option key={h.date} value={holidayDailyBonus}>
                            {h.label} — {holidayMajorationPercent}% ({holidayDailyBonus.toFixed(2)} €)
                          </option>
                        ))}
                        {monthHolidays.length >= 2 && (
                          <option value={holidayDailyBonus * 2}>
                            2 jours fériés — {holidayMajorationPercent * 2}% ({(holidayDailyBonus * 2).toFixed(2)} €)
                          </option>
                        )}
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        className="input bg-warning-50/60"
                        style={{ width: "6rem" }}
                        value={line.joursRepas}
                        onChange={(ev) => updateInput(e.id, "joursRepas", ev.target.value)}
                      >
                        <option value="">0</option>
                        {Array.from(
                          { length: Math.max(params.maxJoursRepas, workingDaysInMonth) },
                          (_, i) => i + 1
                        ).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4 font-semibold text-primary-700">{c?.hs25Heures ?? 0} h</td>
                    <td className="py-2 pr-4 font-semibold text-primary-700">{c?.hs50Heures ?? 0} h</td>
                    <td className="py-2 pr-4 font-semibold text-primary-700">
                      {(c?.primeExceptionnelle ?? 0).toFixed(2)} €
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    Aucun résultat.
                  </td>
                </tr>
              )}
            </tbody>
            {employees.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-bold">
                  <td className="py-2 pr-4">TOTAL</td>
                  <td className="py-2 pr-4">{totals.netSouhaite.toFixed(2)} €</td>
                  <td className="py-2 pr-4">{totals.majJoursFeries.toFixed(2)} €</td>
                  <td className="py-2 pr-4">{totals.joursRepas}</td>
                  <td className="py-2 pr-4">{totals.hs25Heures} h</td>
                  <td className="py-2 pr-4">{totals.hs50Heures} h</td>
                  <td className="py-2 pr-4">{totals.primeExceptionnelle.toFixed(2)} €</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <Modal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        title="Appliquer les heures au pointage"
        maxWidth="max-w-md"
      >
        <p className="text-sm text-slate-600 mb-4">
          Pour chaque employé, les heures HS+25% et HS+50% calculées ce mois-ci seront réparties
          également entre les journées déjà pointées, en <strong>remplaçant</strong> les heures
          supplémentaires que les chefs d&apos;équipe ont saisies. Cette action est irréversible.
        </p>
        <div className="flex gap-3">
          <button className="btn btn-red text-sm px-3 py-2" disabled={syncing} onClick={syncHoursToPointage}>
            {syncing ? "Application…" : "Confirmer et appliquer"}
          </button>
          <button className="btn btn-secondary text-sm px-3 py-2" onClick={() => setShowSyncModal(false)}>
            Annuler
          </button>
        </div>
      </Modal>
    </div>
  );
}


// ── Vue "Dossier salarié" — documents par type, avec péremption et périodes d'embauche ──
type DossierEmployee = { id: string; first_name: string; last_name: string; status: EmployeeStatus };
type DocumentCategory = {
  code: string;
  label: string;
  sort_order: number;
  sensitive: boolean;
  requires_expiry: boolean;
  foreigners_only: boolean;
  per_period: boolean;
};
type EmployeeDocumentRow = {
  id: string;
  employee_id: string;
  category_code: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
  valid_until: string | null;
  registre_entry_id: string | null;
};
type DossierConfidential = {
  nationality: string | null;
  rib: string | null;
  status_ameli: string | null;
  carte_vitale: string | null;
  residence_permit_type: string | null;
  residence_permit_number: string | null;
};
type DossierMedicalVisit = {
  id: string;
  last_visit_date: string | null;
  next_visit_date: string | null;
  visit_subtype: string | null;
};
type RegistreEntry = { id: string; date_entree: string | null; date_sortie: string | null; nationalite: string | null };

const DOSSIER_BUCKET = "dossier-salarie";

const DOSSIER_CATEGORY_ICONS: Record<string, LucideIcon> = {
  contrat: FileSignature,
  rib: Banknote,
  assurance_maladie: ShieldCheck,
  medical_prevaly: HeartPulse,
  titre_visa: Fingerprint,
  passeport: Plane,
  rupture: LogOut,
  carte_btp: HardHat,
  carte_vitale: CreditCard,
  dpae: ClipboardCheck,
  photo: ImageIcon,
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function DossierPeriodCategory({
  category,
  icon: Icon,
  entries,
  documents,
  uploadingKey,
  onUpload,
  onDownload,
  onDelete,
}: {
  category: DocumentCategory;
  icon: LucideIcon;
  entries: RegistreEntry[];
  documents: EmployeeDocumentRow[];
  uploadingKey: string | null;
  onUpload: (categoryCode: string, file: File, registreEntryId: string) => void;
  onDownload: (doc: EmployeeDocumentRow) => void;
  onDelete: (doc: EmployeeDocumentRow) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <p className="text-sm font-bold flex items-center gap-2 mb-2">
        <Icon size={15} className="text-slate-400" />
        {category.label}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400">
          {category.code === "rupture"
            ? "Aucune sortie enregistrée."
            : "Aucune période d'embauche trouvée dans le Registre du personnel."}
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const docs = documents.filter(
              (d) => d.category_code === category.code && d.registre_entry_id === entry.id
            );
            const key = `${category.code}:${entry.id}`;
            return (
              <div key={entry.id} className="rounded-lg bg-slate-50 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-500">
                    {entry.date_entree ? formatDateShortDMY(entry.date_entree) : "—"} →{" "}
                    {entry.date_sortie ? formatDateShortDMY(entry.date_sortie) : "en cours"}
                  </p>
                  <label className="btn btn-secondary text-xs px-2.5 py-1 cursor-pointer">
                    {uploadingKey === key ? (
                      "Envoi…"
                    ) : (
                      <>
                        <Upload size={12} /> Ajouter
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingKey !== null}
                      onChange={(ev) => {
                        const file = ev.target.files?.[0];
                        ev.target.value = "";
                        if (file) onUpload(category.code, file, entry.id);
                      }}
                    />
                  </label>
                </div>
                {docs.length === 0 ? (
                  <p className="text-xs text-slate-400">Aucun document.</p>
                ) : (
                  <ul className="space-y-1">
                    {docs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white"
                      >
                        <span className="truncate">{doc.file_name}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-400">{formatFileSize(doc.file_size)}</span>
                          <button
                            onClick={() => onDownload(doc)}
                            title="Télécharger"
                            className="text-slate-400 hover:text-primary-600"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => onDelete(doc)}
                            title="Supprimer"
                            className="text-slate-400 hover:text-error-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DossierView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [employees, setEmployees] = useState<DossierEmployee[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("active");
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const [documents, setDocuments] = useState<EmployeeDocumentRow[]>([]);
  const [confidential, setConfidential] = useState<DossierConfidential | null>(null);
  const [medicalVisits, setMedicalVisits] = useState<DossierMedicalVisit[]>([]);
  const [registreEntries, setRegistreEntries] = useState<RegistreEntry[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [expiryModal, setExpiryModal] = useState<{ categoryCode: string; file: File } | null>(null);
  const [expiryDate, setExpiryDate] = useState("");

  const [overdueCounts, setOverdueCounts] = useState<Map<string, number>>(new Map());

  async function reloadOverdueCounts() {
    const t = today();
    const [{ data: docs }, { data: visits }] = await Promise.all([
      supabase.from("employee_documents").select("employee_id, valid_until").lt("valid_until", t),
      supabase.from("medical_visits").select("employee_id, next_visit_date").lt("next_visit_date", t),
    ]);
    const map = new Map<string, number>();
    (docs ?? []).forEach((d: { employee_id: string }) => map.set(d.employee_id, (map.get(d.employee_id) ?? 0) + 1));
    (visits ?? []).forEach((v: { employee_id: string }) => map.set(v.employee_id, (map.get(v.employee_id) ?? 0) + 1));
    setOverdueCounts(map);
  }

  useEffect(() => {
    async function load() {
      setLoadingEmployees(true);
      const [{ data: emp }, { data: cats }] = await Promise.all([
        supabase.from("employees").select("id, first_name, last_name, status").order("last_name"),
        supabase.from("document_categories").select("*").order("sort_order"),
      ]);
      setEmployees((emp as DossierEmployee[]) ?? []);
      setCategories((cats as DocumentCategory[]) ?? []);
      setLoadingEmployees(false);
      await reloadOverdueCounts();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function reloadDocuments() {
    if (!selectedEmployeeId) return;
    const { data } = await supabase
      .from("employee_documents")
      .select(
        "id, employee_id, category_code, file_name, storage_path, file_size, created_at, valid_until, registre_entry_id"
      )
      .eq("employee_id", selectedEmployeeId)
      .order("created_at", { ascending: false });
    setDocuments((data as EmployeeDocumentRow[]) ?? []);
  }

  useEffect(() => {
    async function loadDetail() {
      if (!selectedEmployeeId) {
        setDocuments([]);
        setConfidential(null);
        setMedicalVisits([]);
        setRegistreEntries([]);
        return;
      }
      setLoadingDetail(true);
      const [{ data: docs }, { data: conf }, { data: visits }, { data: registre }] = await Promise.all([
        supabase
          .from("employee_documents")
          .select(
            "id, employee_id, category_code, file_name, storage_path, file_size, created_at, valid_until, registre_entry_id"
          )
          .eq("employee_id", selectedEmployeeId)
          .order("created_at", { ascending: false }),
        supabase
          .from("employee_confidential")
          .select("nationality, rib, status_ameli, carte_vitale, residence_permit_type, residence_permit_number")
          .eq("employee_id", selectedEmployeeId)
          .maybeSingle(),
        supabase
          .from("medical_visits")
          .select("id, last_visit_date, next_visit_date, visit_subtype")
          .eq("employee_id", selectedEmployeeId)
          .order("next_visit_date", { ascending: false }),
        supabase
          .from("registre_unique_personnel")
          .select("id, date_entree, date_sortie, nationalite")
          .eq("employee_id", selectedEmployeeId)
          .order("date_entree", { ascending: false }),
      ]);
      setDocuments((docs as EmployeeDocumentRow[]) ?? []);
      setConfidential((conf as DossierConfidential) ?? null);
      setMedicalVisits((visits as DossierMedicalVisit[]) ?? []);
      setRegistreEntries((registre as RegistreEntry[]) ?? []);
      setLoadingDetail(false);
    }
    loadDetail();
  }, [supabase, selectedEmployeeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (q && !employeeName(e).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, statusFilter, search]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);
  const isForeign = isForeignNationality(confidential?.nationality ?? registreEntries[0]?.nationalite ?? null);
  const visibleCategories = useMemo(
    () => categories.filter((c) => !c.foreigners_only || isForeign),
    [categories, isForeign]
  );

  async function uploadFile(
    categoryCode: string,
    file: File,
    opts?: { validUntil?: string; registreEntryId?: string }
  ) {
    if (!selectedEmployeeId) return;
    const key = `${categoryCode}:${opts?.registreEntryId ?? ""}`;
    setUploadingKey(key);
    const path = `${selectedEmployeeId}/${categoryCode}/${uniqueFileToken()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from(DOSSIER_BUCKET).upload(path, file);
    if (uploadError) {
      setUploadingKey(null);
      toast.error("Erreur d'envoi : " + uploadError.message);
      return;
    }
    const { error: insertError } = await supabase.from("employee_documents").insert({
      employee_id: selectedEmployeeId,
      category_code: categoryCode,
      file_name: file.name,
      storage_path: path,
      file_size: file.size,
      mime_type: file.type || null,
      valid_until: opts?.validUntil || null,
      registre_entry_id: opts?.registreEntryId || null,
    });
    setUploadingKey(null);
    if (insertError) {
      toast.error("Erreur : " + insertError.message);
      return;
    }
    await Promise.all([reloadDocuments(), reloadOverdueCounts()]);
    toast.success("Document ajouté");
  }

  async function downloadFile(doc: EmployeeDocumentRow) {
    const { data, error } = await supabase.storage.from(DOSSIER_BUCKET).download(doc.storage_path);
    if (error || !data) {
      toast.error("Erreur de téléchargement : " + (error?.message ?? "fichier introuvable"));
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteFile(doc: EmployeeDocumentRow) {
    if (!confirm(`Supprimer « ${doc.file_name} » ?`)) return;
    const { error: storageError } = await supabase.storage.from(DOSSIER_BUCKET).remove([doc.storage_path]);
    if (storageError) {
      toast.error("Erreur : " + storageError.message);
      return;
    }
    const { error: dbError } = await supabase.from("employee_documents").delete().eq("id", doc.id);
    if (dbError) {
      toast.error("Erreur : " + dbError.message);
      return;
    }
    await Promise.all([reloadDocuments(), reloadOverdueCounts()]);
    toast.success("Document supprimé");
  }

  return (
    <div className="flex gap-4 items-start">
      <div className="card w-72 shrink-0">
        <p className="font-bold mb-3">Employés</p>
        <input
          className="input mb-2"
          placeholder="Rechercher un nom…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input mb-3"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EmployeeStatus | "all")}
        >
          <option value="active">Actifs</option>
          <option value="on_leave">En congé</option>
          <option value="terminated">Sortis</option>
          <option value="all">Tous</option>
        </select>
        {loadingEmployees ? (
          <SkeletonRows rows={4} cols={1} />
        ) : (
          <div className="max-h-[32rem] overflow-y-auto -mx-1">
            {filtered.map((e) => {
              const overdueCount = overdueCounts.get(e.id) ?? 0;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedEmployeeId(e.id)}
                  className={`w-full flex items-center justify-between gap-2 text-left rounded-lg px-2 py-1.5 text-sm font-semibold ${
                    selectedEmployeeId === e.id
                      ? "bg-primary-50 text-primary-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">{employeeName(e)}</span>
                  {overdueCount > 0 && (
                    <span className="badge badge-error shrink-0" title="Documents en retard">
                      {overdueCount}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && <EmptyState title="Aucun employé" />}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {!selectedEmployee ? (
          <div className="card">
            <EmptyState
              title="Sélectionnez un employé"
              description="Choisissez un employé dans la liste pour voir et gérer son dossier."
            />
          </div>
        ) : (
          <div className="card">
            <p className="font-bold mb-4">Dossier — {employeeName(selectedEmployee)}</p>
            {loadingDetail ? (
              <SkeletonRows rows={4} cols={3} />
            ) : (
              <div className="space-y-4">
                {visibleCategories.map((cat) => {
                  const Icon = DOSSIER_CATEGORY_ICONS[cat.code] ?? FileText;

                  if (cat.per_period) {
                    const entries = cat.code === "rupture" ? registreEntries.filter((r) => r.date_sortie) : registreEntries;
                    return (
                      <DossierPeriodCategory
                        key={cat.code}
                        category={cat}
                        icon={Icon}
                        entries={entries}
                        documents={documents}
                        uploadingKey={uploadingKey}
                        onUpload={(code, file, registreEntryId) => uploadFile(code, file, { registreEntryId })}
                        onDownload={downloadFile}
                        onDelete={deleteFile}
                      />
                    );
                  }

                  const docs = documents.filter((d) => d.category_code === cat.code);
                  const key = `${cat.code}:`;

                  return (
                    <div key={cat.code} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold flex items-center gap-2">
                          <Icon size={15} className="text-slate-400" />
                          {cat.label}
                          {cat.sensitive && <span className="badge badge-warning">confidentiel</span>}
                        </p>
                        <label className="btn btn-secondary text-xs px-3 py-1.5 cursor-pointer">
                          {uploadingKey === key ? (
                            "Envoi…"
                          ) : (
                            <>
                              <Upload size={13} /> Ajouter
                            </>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            disabled={uploadingKey !== null}
                            onChange={(ev) => {
                              const file = ev.target.files?.[0];
                              ev.target.value = "";
                              if (!file) return;
                              if (cat.requires_expiry) {
                                setExpiryModal({ categoryCode: cat.code, file });
                                setExpiryDate("");
                              } else {
                                uploadFile(cat.code, file);
                              }
                            }}
                          />
                        </label>
                      </div>

                      {cat.code === "rib" && confidential?.rib && (
                        <p className="text-xs text-slate-500 mb-2">
                          IBAN enregistré : <span className="font-semibold">{confidential.rib}</span>
                        </p>
                      )}
                      {cat.code === "assurance_maladie" && confidential?.status_ameli && (
                        <p className="text-xs text-slate-500 mb-2">
                          Statut Ameli : <span className="font-semibold">{confidential.status_ameli}</span>
                        </p>
                      )}
                      {cat.code === "carte_vitale" && confidential?.carte_vitale && (
                        <p className="text-xs text-slate-500 mb-2">
                          N° Carte Vitale : <span className="font-semibold">{confidential.carte_vitale}</span>
                        </p>
                      )}
                      {cat.code === "titre_visa" &&
                        (confidential?.residence_permit_type || confidential?.residence_permit_number) && (
                          <p className="text-xs text-slate-500 mb-2">
                            {confidential.residence_permit_type ?? "Titre"}
                            {confidential.residence_permit_number ? ` — n° ${confidential.residence_permit_number}` : ""}
                          </p>
                        )}
                      {cat.code === "medical_prevaly" &&
                        (medicalVisits.length === 0 ? (
                          <p className="text-xs text-slate-400 mb-2">Aucune visite enregistrée dans le suivi médical.</p>
                        ) : (
                          <div className="mb-2 space-y-1">
                            {medicalVisits.map((v) => {
                              const urgency = dateUrgency(v.next_visit_date);
                              return (
                                <p key={v.id} className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                  <span>
                                    {v.visit_subtype ?? "Visite"} — dernière : {v.last_visit_date ?? "—"} · prochaine :{" "}
                                    {v.next_visit_date ?? "—"}
                                  </span>
                                  {urgency && <span className={`badge badge-${urgency.tone}`}>{urgency.label}</span>}
                                </p>
                              );
                            })}
                          </div>
                        ))}

                      {docs.length === 0 ? (
                        <p className="text-xs text-slate-400">Aucun document.</p>
                      ) : (
                        <ul className="space-y-1">
                          {docs.map((doc) => {
                            const urgency = dateUrgency(doc.valid_until);
                            return (
                              <li
                                key={doc.id}
                                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                              >
                                <span className="truncate flex items-center gap-2 flex-wrap">
                                  {doc.file_name}
                                  {doc.valid_until && (
                                    <span className="text-xs text-slate-400">expire le {doc.valid_until}</span>
                                  )}
                                  {urgency && <span className={`badge badge-${urgency.tone}`}>{urgency.label}</span>}
                                </span>
                                <span className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-slate-400">{formatFileSize(doc.file_size)}</span>
                                  <button
                                    onClick={() => downloadFile(doc)}
                                    title="Télécharger"
                                    className="text-slate-400 hover:text-primary-600"
                                  >
                                    <Download size={15} />
                                  </button>
                                  <button
                                    onClick={() => deleteFile(doc)}
                                    title="Supprimer"
                                    className="text-slate-400 hover:text-error-600"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={!!expiryModal}
        onClose={() => setExpiryModal(null)}
        title="Date d'expiration"
        maxWidth="max-w-sm"
      >
        {expiryModal && (
          <>
            <p className="text-sm text-slate-500 mb-3">
              Fichier : <span className="font-semibold">{expiryModal.file.name}</span>
            </p>
            <label className="text-xs font-bold text-slate-500">
              Date d&apos;expiration
              <input
                type="date"
                className="input mt-1"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </label>
            <div className="flex gap-3 mt-4">
              <button
                className="btn btn-primary text-sm px-3 py-2"
                disabled={!expiryDate}
                onClick={async () => {
                  await uploadFile(expiryModal.categoryCode, expiryModal.file, { validUntil: expiryDate });
                  setExpiryModal(null);
                }}
              >
                Ajouter
              </button>
              <button className="btn btn-secondary text-sm px-3 py-2" onClick={() => setExpiryModal(null)}>
                Annuler
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
