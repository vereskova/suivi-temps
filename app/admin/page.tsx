"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Banknote,
  Bell,
  BookText,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  Crown,
  Download,
  Eye,
  FileSignature,
  FileSpreadsheet,
  FileText,
  FolderLock,
  Fingerprint,
  GraduationCap,
  HardHat,
  HeartPulse,
  History,
  Image as ImageIcon,
  Languages,
  LogOut,
  Network,
  Pencil,
  Plane,
  RefreshCw,
  Scale,
  ShieldCheck,
  Shirt,
  Trash2,
  Upload,
  User,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatLive, normalizeTime, timeToMinutes, minutesToHHMM } from "@/lib/time";
import { DOCUMENT_TYPES, getDocumentType } from "@/lib/documents/registry";
import { computeRupture, RuptureType } from "@/lib/rupture/compute";
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
  bureau_role: string | null;
  hire_date: string | null;
  end_date: string | null;
  badge_emoji: string | null;
  badge_label: string | null;
};

type Team = { id: string; name: string; chef_employee_id: string | null };

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

/** Splits one delimited line, honoring double-quoted fields (so a quoted
 *  value can contain the delimiter itself) — used for Prevaly's CSV export. */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

/** "31/03/2025" -> "2025-03-31"; "-", empty, or unparseable -> null. */
function parseFrDateToIso(s: string): string | null {
  const t = s.trim();
  if (!t || t === "-") return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

/** French label with a small, muted Russian translation stacked underneath —
 * the bilingual pattern established in the sidebar nav and Organigramme. */
function Bi({
  fr,
  ru,
  className = "",
  after,
}: {
  fr: React.ReactNode;
  ru?: string;
  className?: string;
  /** Rendered inline right after `fr`, on the same line — e.g. an InfoNote
   *  icon, which would otherwise vertically center against the full
   *  two-line fr+ru block instead of lining up with the fr text itself. */
  after?: React.ReactNode;
}) {
  return (
    <span className={`inline-block leading-tight align-middle ${className}`}>
      <span className="block truncate">
        {fr}
        {after}
      </span>
      {ru && (
        <span className="block truncate text-[0.6rem] font-medium normal-case opacity-60">
          {ru}
        </span>
      )}
    </span>
  );
}

/** Small "i" button next to a section title — opens a modal with a full
 *  Russian explanation of what the section is for and how to use it. */
function InfoNote({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Инструкция"
        className="ml-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-200 align-middle text-[10px] font-bold text-stone-500 hover:bg-primary-100 hover:text-primary-700"
      >
        i
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} maxWidth="max-w-md">
        <p className="whitespace-pre-line text-sm text-stone-600">{text}</p>
      </Modal>
    </>
  );
}

/** Icon-only row action (edit/view) — used instead of a bilingual text label
 * for links that repeat on every table row, to avoid duplicating text dozens
 * of times per screen. */
function RowAction({
  icon: Icon,
  title,
  titleRu,
  onClick,
  active,
}: {
  icon: LucideIcon;
  title: string;
  titleRu: string;
  onClick: () => void;
  /** Highlights the button to reflect an on/off state (e.g. a toggle already applied). */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${title} / ${titleRu}`}
      className={`inline-flex items-center justify-center rounded-md p-1.5 ${
        active
          ? "bg-success-100 text-success-700 hover:bg-success-200"
          : "bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
      }`}
    >
      <Icon size={15} className={active ? "fill-current" : ""} />
    </button>
  );
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
  | "rupture"
  | "echeances"
  | "registre"
  | "organigramme"
  | "francais"
  | "dossier"
  | "paie";

type NavItem = { key: ViewKey; label: string; labelRu: string; icon: LucideIcon };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "",
    items: [{ key: "echeances", label: "Notifications", labelRu: "Уведомления", icon: Bell }],
  },
  {
    title: "Pointage",
    items: [
      { key: "jour", label: "Par jour", labelRu: "По дням", icon: CalendarDays },
      { key: "employe", label: "Par employé", labelRu: "По сотруднику", icon: User },
      { key: "mois", label: "Totaux du mois", labelRu: "Итоги за месяц", icon: BarChart3 },
      { key: "export", label: "Export / Import", labelRu: "Экспорт / Импорт", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Effectif",
    items: [
      { key: "effectif", label: "Employés", labelRu: "Сотрудники", icon: Users },
      { key: "medical", label: "Médical", labelRu: "Медицина", icon: HeartPulse },
      { key: "formations", label: "Formations", labelRu: "Обучение", icon: GraduationCap },
      { key: "tailles", label: "Tailles", labelRu: "Размеры", icon: Shirt },
    ],
  },
  {
    title: "RH",
    items: [
      { key: "documents", label: "Documents", labelRu: "Документы", icon: FileText },
      { key: "rupture", label: "Calculateur de rupture", labelRu: "Калькулятор увольнения", icon: Scale },
      { key: "registre", label: "Registre du personnel", labelRu: "Реестр персонала", icon: BookText },
      { key: "organigramme", label: "Organigramme", labelRu: "Оргструктура", icon: Network },
      { key: "francais", label: "Cours de français", labelRu: "Курсы французского", icon: Languages },
      { key: "dossier", label: "Dossier salarié", labelRu: "Личное дело", icon: FolderLock },
      { key: "paie", label: "Paie", labelRu: "Зарплата", icon: Wallet },
    ],
  },
];

export default function AdminPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("jour");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [seenNotificationKeys, setSeenNotificationKeys] = useState<Set<string>>(new Set());

  async function loadNotifications() {
    setNotificationsLoading(true);
    const rows = await fetchNotificationRows(supabase);
    setNotifications(rows);
    setNotificationsLoading(false);
  }

  const hasUnreadNotifications = notifications.some(
    (r) => !seenNotificationKeys.has(notificationKey(r))
  );

  useEffect(() => {
    async function load() {
      await Promise.resolve();
      try {
        const raw = localStorage.getItem(NOTIFICATIONS_SEEN_STORAGE_KEY);
        if (raw) setSeenNotificationKeys(new Set(JSON.parse(raw)));
      } catch {
        // ignore malformed/unavailable localStorage
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (view !== "echeances" || notifications.length === 0) return;
    async function markSeen() {
      await Promise.resolve();
      setSeenNotificationKeys((prev) => {
        const next = new Set(prev);
        notifications.forEach((r) => next.add(notificationKey(r)));
        try {
          localStorage.setItem(NOTIFICATIONS_SEEN_STORAGE_KEY, JSON.stringify(Array.from(next)));
        } catch {
          // ignore malformed/unavailable localStorage
        }
        return next;
      });
    }
    markSeen();
  }, [view, notifications]);

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

  async function handleToggleChef(teamId: string, employeeId: string) {
    const current = teams.find((t) => t.id === teamId)?.chef_employee_id ?? null;
    const nextChef = current === employeeId ? null : employeeId;
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, chef_employee_id: nextChef } : t)));
    const { error } = await supabase.from("teams").update({ chef_employee_id: nextChef }).eq("id", teamId);
    if (error) {
      toast.error("Erreur : " + error.message);
      setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, chef_employee_id: current } : t)));
    }
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

      setRole(roleRow?.role ?? null);

      if (roleRow?.role === "rh_admin" || roleRow?.role === "rh") {
        const [, { data: absenceRows }, { data: teamRows }] = await Promise.all([
          loadActiveEmployees(),
          supabase.from("absence_types").select("id, code, label").order("label"),
          supabase.from("teams").select("id, name, chef_employee_id").eq("active", true).order("name"),
        ]);
        setAbsenceTypes(absenceRows ?? []);
        setTeams(teamRows ?? []);
        loadNotifications();
      }

      // The "rh" role has no Pointage/Paie access, so it can't land on the
      // "jour" default — send it to Employés instead.
      if (roleRow?.role === "rh") {
        setView("effectif");
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

  if (role !== "rh_admin" && role !== "comptable" && role !== "rh") {
    return (
      <main className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="card max-w-sm text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-primary-600 text-white">
            <LogoMark size={44} />
          </div>
          <p className="font-bold text-stone-900">Accès réservé RH</p>
          <p className="text-sm text-stone-400 mt-1">Доступ только для RH.</p>
          <Link href="/" className="btn btn-dark mt-4 inline-flex">
            Retour
          </Link>
        </div>
      </main>
    );
  }

  // Comptable only ever needs Paie — same shell as the full admin view, just
  // with a single-item sidebar instead of the full NAV_GROUPS.
  if (role === "comptable") {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="mx-auto max-w-[1400px]">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white shadow-[var(--shadow-pop)]">
                <LogoMark size={24} />
              </div>
              <div>
                <p className="text-lg font-extrabold tracking-tight text-stone-900 leading-tight">VLADIS</p>
                <p className="text-xs font-semibold text-stone-400 leading-tight">Comptabilité</p>
              </div>
            </div>
            <button
              className="btn btn-secondary text-sm"
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/login");
              }}
            >
              <LogOut size={15} />
              Déconnexion
            </button>
          </div>

          <div className="flex gap-6 items-start">
            <aside className="w-60 shrink-0">
              <nav className="card p-3 space-y-4 sticky top-4">
                <SidebarSection title="RH">
                  <SidebarLink icon={Wallet} active label="Paie" labelRu="Зарплата" />
                </SidebarSection>
              </nav>
            </aside>
            <div className="flex-1 min-w-0">
              <PaieView supabase={supabase} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  // rh: Effectif + RH sections only — no Pointage group, no Paie or
  // Calculateur de rupture (admin-only for now).
  const visibleNavGroups =
    role === "rh"
      ? NAV_GROUPS.filter((g) => g.title !== "Pointage").map((g) => ({
          ...g,
          items: g.items.filter((item) => item.key !== "paie" && item.key !== "rupture"),
        }))
      : NAV_GROUPS;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-primary-600 text-white shadow-[var(--shadow-pop)]">
              <LogoMark size={44} />
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight text-stone-900 leading-tight">
                VLADIS
              </p>
              <p className="text-xs font-semibold text-stone-400 leading-tight">
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
              {visibleNavGroups.map((group) => (
                <SidebarSection key={group.title} title={group.title}>
                  {group.items.map((item) => (
                    <SidebarLink
                      key={item.key}
                      icon={item.icon}
                      active={view === item.key}
                      onClick={() => setView(item.key)}
                      label={item.label}
                      labelRu={item.labelRu}
                      dot={item.key === "echeances" ? hasUnreadNotifications : false}
                    />
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
                onToggleChef={handleToggleChef}
              />
            )}
            {view === "medical" && <MedicalView supabase={supabase} />}
            {view === "formations" && <FormationsView supabase={supabase} />}
            {view === "tailles" && <TaillesView supabase={supabase} />}
            {view === "documents" && <DocumentsView supabase={supabase} />}
            {view === "rupture" && <RuptureView supabase={supabase} />}
            {view === "echeances" && (
              <NotificationsView notifications={notifications} loading={notificationsLoading} />
            )}
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
      {title && (
        <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-wider text-stone-400">
          {title}
        </p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
  labelRu,
  dot,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  icon?: LucideIcon;
  label: string;
  labelRu?: string;
  dot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
        disabled
          ? "text-stone-300 cursor-not-allowed"
          : active
          ? "bg-primary-50 text-primary-700"
          : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
      }`}
    >
      {Icon && (
        <Icon
          size={16}
          className={`shrink-0 ${
            disabled
              ? "text-stone-300"
              : active
              ? "text-primary-600"
              : "text-stone-400 group-hover:text-stone-500"
          }`}
        />
      )}
      <span className="min-w-0 leading-tight flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        {labelRu && <span className="block truncate text-[0.68rem] font-medium opacity-60">{labelRu}</span>}
      </span>
      {dot && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-error-500" />}
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
      <div className="mb-3 font-bold">
        <Bi
          fr="Par jour"
          ru="По дням"
          after={
            <InfoNote
              title="Par jour"
              text={
                "Часы всех бригад за один выбранный день. Можно менять дату, искать по имени и фильтровать по бригаде.\n\n" +
                "Нажмите на карандаш у сотрудника, чтобы вписать или исправить его часы, отметить отсутствие и его причину.\n\n" +
                "Это те же данные, что бригадиры вводят через открытую форму на главной странице (без входа в систему) — здесь просто видно сразу всех, и можно всё поправить."
              }
            />
          }
        />
      </div>
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="font-bold text-sm">
          <Bi fr="Date" ru="Дата" />
          <input
            type="date"
            className="input mt-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="font-bold text-sm">
          <Bi fr="Recherche" ru="Поиск" />
          <input
            className="input mt-2"
            placeholder="Nom, prénom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="font-bold text-sm">
          <Bi fr="Équipe" ru="Бригада" />
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
          <EmptyState titleRu="Нет результатов" description="Aucun résultat pour ces filtres." />
        </div>
      ) : (
        filteredGrouped.map(([teamName, members]) => (
          <div key={teamName} className="card mb-4 overflow-x-auto">
            <p className="font-bold mb-3">{teamName}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-stone-400">
                  <th className="pb-2 pr-4"><Bi fr="Nom" ru="Фамилия" /></th>
                  <th className="pb-2 pr-4"><Bi fr="Début" ru="Начало" /></th>
                  <th className="pb-2 pr-4"><Bi fr="Fin" ru="Конец" /></th>
                  <th className="pb-2 pr-4"><Bi fr="Pause" ru="Перерыв" /></th>
                  <th className="pb-2 pr-4"><Bi fr="H. Supp" ru="Сверхур." /></th>
                  <th className="pb-2 pr-4"><Bi fr="Total" ru="Итого" /></th>
                  <th className="pb-2 pr-4"><Bi fr="Statut" ru="Статус" /></th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {members.map((e) => {
                  const r = byEmployee.get(e.id);
                  const isEditing = editingId === e.id;

                  if (isEditing && editForm) {
                    return (
                      <tr key={e.id} className="border-t border-stone-100 bg-stone-50">
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
                                  : "bg-stone-200"
                              }`}
                            >
                              <Bi fr="Absent" ru="Отсутствует" />
                            </button>

                            {editForm.absent ? (
                              <select
                                className="input text-sm px-2 py-1"
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
                                  labelRu="Начало"
                                  value={editForm.start}
                                  onChange={(v) => setEditForm({ ...editForm, start: v })}
                                />
                                <EditTime
                                  label="Fin"
                                  labelRu="Конец"
                                  value={editForm.end}
                                  onChange={(v) => setEditForm({ ...editForm, end: v })}
                                />
                                <EditTime
                                  label="Pause"
                                  labelRu="Перерыв"
                                  value={editForm.pause}
                                  onChange={(v) => setEditForm({ ...editForm, pause: v })}
                                />
                                <EditTime
                                  label="H. Supp"
                                  labelRu="Сверхур."
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
                              <Bi fr="Enregistrer" ru="Сохранить" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-stone-400 underline"
                            >
                              <Bi fr="Annuler" ru="Отмена" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={e.id} className="border-t border-stone-100">
                      <td className="py-2 pr-4 font-semibold">
                        {employeeName(e)}
                      </td>
                      {!r ? (
                        <td colSpan={5} className="py-2 text-stone-300 italic">
                          — non saisi{" "}
                          <span className="not-italic text-[0.85em] opacity-70">
                            / не указано
                          </span>{" "}
                          —
                        </td>
                      ) : r.is_absent ? (
                        <td colSpan={5} className="py-2 text-error-600 font-semibold">
                          Absent{" "}
                          <span className="text-[0.85em] opacity-70">/ Отсутствует</span>
                          {r.absence_types ? ` — ${r.absence_types.label}` : ""}
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
                        <RowAction
                          icon={Pencil}
                          title="Modifier"
                          titleRu="Изменить"
                          onClick={() => startEdit(e)}
                        />
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
  labelRu,
  value,
  onChange,
}: {
  label: string;
  labelRu?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-stone-400">
        <Bi fr={label} ru={labelRu} />
      </label>
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
      <div className="mb-3 font-bold">
        <Bi
          fr="Par employé"
          ru="По сотруднику"
          after={
            <InfoNote
              title="Par employé"
              text={
                "Помесячный отчёт по одному сотруднику: выберите его, месяц и год — увидите все дни целиком (часы, переработки, отсутствия) и итог за месяц.\n\n" +
                "Удобно, чтобы свериться по одному человеку, не листая общий список «Par jour» по дням."
              }
            />
          }
        />
      </div>
      <div className="card mb-4 flex flex-wrap gap-4 items-end">
        <label className="font-bold text-sm">
          <Bi fr="Employé" ru="Сотрудник" />
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
          <Bi fr="Mois" ru="Месяц" />
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
          <Bi fr="Année" ru="Год" />
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
          <EmptyState title="Sélectionnez un employé" titleRu="Выберите сотрудника" />
        </div>
      ) : loading ? (
        <div className="card">
          <SkeletonRows rows={5} cols={4} />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-400">
                <th className="pb-2 pr-4"><Bi fr="Jour" ru="День" /></th>
                <th className="pb-2 pr-4"><Bi fr="Date" ru="Дата" /></th>
                <th className="pb-2 pr-4"><Bi fr="Début" ru="Начало" /></th>
                <th className="pb-2 pr-4"><Bi fr="Fin" ru="Конец" /></th>
                <th className="pb-2 pr-4"><Bi fr="Pause" ru="Перерыв" /></th>
                <th className="pb-2 pr-4"><Bi fr="H. Supp" ru="Сверхур." /></th>
                <th className="pb-2"><Bi fr="Total" ru="Итого" /></th>
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
                    className={`border-t border-stone-100 ${
                      isWeekend ? "bg-stone-50" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-4 capitalize text-stone-500">
                      {weekday}
                    </td>
                    <td className="py-1.5 pr-4">{d.getUTCDate()}</td>
                    {!r ? (
                      <td colSpan={4} className="py-1.5 text-stone-300 italic">
                        —
                      </td>
                    ) : r.is_absent ? (
                      <td colSpan={4} className="py-1.5 text-error-600 font-semibold">
                        Absent{" "}
                        <span className="text-[0.85em] opacity-70">/ Отсутствует</span>
                        {r.absence_types ? ` — ${r.absence_types.label}` : ""}
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
              <tr className="border-t-2 border-stone-200">
                <td colSpan={6} className="pt-3 text-right font-bold">
                  Total du mois{" "}
                  <span className="text-xs font-medium opacity-60">/ Итого за месяц</span>
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
      <div className="mb-3 font-bold">
        <Bi
          fr="Totaux du mois"
          ru="Итоги за месяц"
          after={
            <InfoNote
              title="Totaux du mois"
              text={
                "Свод отработанных часов за месяц сразу по всем сотрудникам, сгруппированным по бригадам.\n\n" +
                "Помогает быстро увидеть общую картину и заметить, у кого мало часов или совсем нет данных за месяц, прежде чем считать зарплату."
              }
            />
          }
        />
      </div>
      <div className="card mb-4 flex flex-wrap gap-4 items-end max-w-md">
        <label className="font-bold text-sm">
          <Bi fr="Mois" ru="Месяц" />
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
          <Bi fr="Année" ru="Год" />
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
              <tr className="text-left text-stone-400">
                <th className="pb-2 pr-4"><Bi fr="Nom" ru="Фамилия" /></th>
                <th className="pb-2 pr-4"><Bi fr="Équipe" ru="Бригада" /></th>
                <th className="pb-2 pr-4"><Bi fr="Heures totales" ru="Часы всего" /></th>
                <th className="pb-2"><Bi fr="Statut" ru="Статус" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const total = totalsByEmployee.get(e.id);
                return (
                  <tr key={e.id} className="border-t border-stone-100">
                    <td className="py-2 pr-4 font-semibold">
                      {employeeName(e)}
                    </td>
                    <td className="py-2 pr-4 text-stone-500">
                      {e.teams?.name ?? "—"}
                    </td>
                    <td className="py-2 pr-4 font-bold">
                      {total ? fmtMinutes(total) : "—"}
                    </td>
                    <td
                      className={`py-2 font-semibold ${
                        total ? "text-success-600" : "text-stone-300"
                      }`}
                    >
                      {total ? (
                        "OK"
                      ) : (
                        <>
                          Aucune donnée{" "}
                          <span className="text-[0.85em] opacity-70">/ Нет данных</span>
                        </>
                      )}
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
        <div className="font-bold mb-1">
          <Bi
            fr="Exporter"
            ru="Экспорт"
            after={
              <InfoNote
                title="Export / Import"
                text={
                  "Экспорт выгружает часы за выбранный период в Excel-файл — для архива или чтобы передать бухгалтеру.\n\n" +
                  "Импорт — обратная операция: если часы были исправлены или посчитаны в Excel, загрузите файл обратно, и они запишутся в систему так же, как при ручном вводе через «Par jour»."
                }
              />
            }
          />
        </div>
        <p className="text-xs text-stone-400 mb-4">
          Télécharge un fichier Excel des pointages sur une période — à
          modifier puis réimporter si besoin.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="font-bold text-sm">
            <Bi fr="Du" ru="С" />
            <input
              type="date"
              className="input mt-2"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="font-bold text-sm">
            <Bi fr="Au" ru="По" />
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
            {exporting ? "Export…" : <Bi fr="Exporter (.xlsx)" ru="Экспортировать" />}
          </button>
        </div>
      </div>

      <div className="card">
        <p className="font-bold mb-1"><Bi fr="Importer" ru="Импорт" /></p>
        <p className="text-xs text-stone-400 mb-4">
          Réimporte un fichier au même format que l&apos;export — les lignes
          remplacent les données existantes pour la même date et le même
          employé (identifiées par la colonne <code>employee_id</code>).
        </p>
        <label className={`btn btn-secondary inline-flex ${importing ? "" : "cursor-pointer"}`}>
          <Upload size={14} />{" "}
          {importing ? (
            "Import en cours…"
          ) : (
            <Bi fr="Choisir un fichier" ru="Выбрать файл" />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={importing}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />
        </label>
        {importing && (
          <p className="text-sm text-stone-400 mt-3">
            Import en cours… <span className="opacity-70">/ Импорт…</span>
          </p>
        )}
        {importSummary && (
          <p className="text-sm font-semibold text-success-600 mt-3">
            {importSummary}
          </p>
        )}
        {importErrors.length > 0 && (
          <div className="mt-3 text-sm text-error-600">
            <p className="font-semibold"><Bi fr="Erreurs :" ru="Ошибки:" /></p>
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
const STATUS_LABELS_RU: Record<EmployeeStatus, string> = {
  active: "Активен",
  on_leave: "В отпуске",
  terminated: "Уволен",
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
  onToggleChef,
}: {
  supabase: ReturnType<typeof createClient>;
  teams: Team[];
  onChanged: () => void;
  onToggleChef: (teamId: string, employeeId: string) => void;
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
          "id, first_name, last_name, team_id, status, category, bureau_role, hire_date, end_date, badge_emoji, badge_label, teams!employees_team_id_fkey(name)"
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

  const teamColorByName = useMemo(() => {
    const sorted = [...teams].map((t) => t.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return new Map(sorted.map((name, i) => [name, PAIE_TEAM_COLOR_PALETTE[i % PAIE_TEAM_COLOR_PALETTE.length]]));
  }, [teams]);

  function chantierRowColor(e: EmployeeFull): string {
    if (e.category === "bureau" || !e.team_id) return "";
    const teamName = teamsById.get(e.team_id);
    return (teamName && teamColorByName.get(teamName)) || "";
  }

  const chefIdByTeamId = useMemo(
    () => new Map(teams.map((t) => [t.id, t.chef_employee_id])),
    [teams]
  );

  function isChef(e: EmployeeFull): boolean {
    return !!e.team_id && chefIdByTeamId.get(e.team_id) === e.id;
  }

  const groupedFiltered = useMemo(() => {
    const bureau = filtered.filter((e) => e.category === "bureau");
    const chantier = filtered
      .filter((e) => e.category !== "bureau")
      .sort((a, b) => {
        const teamA = a.team_id ? teamsById.get(a.team_id) ?? "" : "";
        const teamB = b.team_id ? teamsById.get(b.team_id) ?? "" : "";
        if (!teamA && teamB) return 1;
        if (teamA && !teamB) return -1;
        return (
          teamA.localeCompare(teamB, undefined, { numeric: true }) ||
          a.last_name.localeCompare(b.last_name)
        );
      });
    return ([["Bureau", bureau] as const, ["Chantier", chantier] as const]).filter(
      ([, members]) => members.length > 0
    );
  }, [filtered, teamsById]);

  function equipeOrPoste(e: EmployeeFull) {
    if (e.category === "bureau") {
      return BUREAU_ROLE_LABELS[e.bureau_role ?? ""] ?? "Bureau";
    }
    return e.team_id ? teamsById.get(e.team_id) ?? "—" : "—";
  }

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
          <div className="font-bold flex items-center">
            Employés ({filtered.length}/{employees.length})
            <InfoNote
              title="Employés"
              text={
                "Полный список сотрудников: бригада или должность в офисе, статус (активен / в отпуске / уволен), корона бригадира, личный значок.\n\n" +
                "«Изменить» — быстрая правка прямо в строке (бригада, статус, даты). «Подробнее» — открывает полную карточку: паспортные данные, зарплата, RIB, вид на жительство и т.д.\n\n" +
                "Корону бригадира можно поставить или снять здесь же, или в разделе «Organigramme» — это один и тот же параметр."
              }
            />
          </div>
          <button
            className="btn btn-primary text-sm px-3 py-2"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Bi fr="+ Nouvel employé" ru="Новый сотрудник" />
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
            {counts.active} actifs <span className="opacity-70">/ активны</span>
          </button>
          <button
            onClick={() => setStatusFilter("on_leave")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "on_leave"
                ? "bg-warning-600 text-white"
                : "bg-warning-50 text-warning-700"
            }`}
          >
            {counts.on_leave} en congé <span className="opacity-70">/ в отпуске</span>
          </button>
          <button
            onClick={() => setStatusFilter("terminated")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "terminated"
                ? "bg-error-600 text-white"
                : "bg-error-50 text-error-700"
            }`}
          >
            {counts.terminated} sortis <span className="opacity-70">/ уволены</span>
          </button>
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "all"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-500"
            }`}
          >
            Tous ({employees.length}) <span className="opacity-70">/ все</span>
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Recherche" ru="Поиск" />
            </label>
            <input
              className="input"
              placeholder="Nom, prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Équipe" ru="Бригада" />
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
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Catégorie" ru="Категория" />
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
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Prénom" ru="Имя" />
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
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Nom" ru="Фамилия" />
            </label>
            <input
              className="input"
              value={newEmployee.lastName}
              onChange={(e) =>
                setNewEmployee({ ...newEmployee, lastName: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Équipe" ru="Бригада" />
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
            {adding ? "…" : <Bi fr="Ajouter" ru="Добавить" />}
          </button>
        </div>
      )}

      {loading ? (
        <div className="card">
          <SkeletonRows rows={5} cols={5} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState titleRu="Нет результатов" description="Aucun employé ne correspond à ces filtres." />
        </div>
      ) : (
        groupedFiltered.map(([sectionLabel, members]) => (
        <div key={sectionLabel} className="card mb-4 overflow-x-auto">
          <p className="font-bold mb-3">
            <Bi fr={sectionLabel} ru={sectionLabel === "Bureau" ? "Офис" : "Стройка"} />
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-400">
                <th className="pb-2 pr-4"><Bi fr="Nom" ru="Фамилия" /></th>
                <th className="pb-2 pr-4">
                  {sectionLabel === "Bureau" ? (
                    <Bi fr="Poste" ru="Должность" />
                  ) : (
                    <Bi fr="Équipe" ru="Бригада" />
                  )}
                </th>
                <th className="pb-2 pr-4"><Bi fr="Statut" ru="Статус" /></th>
                <th className="pb-2 pr-4"><Bi fr="Date de fin" ru="Дата увольнения" /></th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {members.map((e) => {
                const isEditing = editingId === e.id;
                return (
                  <Fragment key={e.id}>
                  <tr className={`border-t border-stone-100 ${chantierRowColor(e)}`}>
                    <td className="py-2 pr-4 font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        {isChef(e) && (
                          <Crown
                            size={13}
                            className="shrink-0 fill-current text-success-600"
                          />
                        )}
                        {employeeName(e)}
                        {e.badge_emoji && (
                          <span title={e.badge_label ?? undefined}>{e.badge_emoji}</span>
                        )}
                      </span>
                    </td>
                    {isEditing && editForm ? (
                      <>
                        <td className="py-2 pr-4">
                          <select
                            className="input text-sm px-2 py-1"
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
                            className="input text-sm px-2 py-1"
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
                                {STATUS_LABELS[s]} / {STATUS_LABELS_RU[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          {editForm.status === "terminated" && (
                            <input
                              type="date"
                              className="input text-sm px-2 py-1"
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
                            <Bi fr="Enregistrer" ru="Сохранить" />
                          </button>
                          <button
                            className="text-xs text-stone-400 underline"
                            onClick={() => setEditingId(null)}
                          >
                            <Bi fr="Annuler" ru="Отмена" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-stone-500">
                          {equipeOrPoste(e)}
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
                        <td className="py-2 pr-4 text-stone-500">
                          {e.end_date ?? "—"}
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          {e.team_id && (
                            <RowAction
                              icon={Crown}
                              title={isChef(e) ? "Retirer chef d'équipe" : "Désigner chef d'équipe"}
                              titleRu={isChef(e) ? "Снять бригадира" : "Назначить бригадиром"}
                              active={isChef(e)}
                              onClick={() => onToggleChef(e.team_id!, e.id)}
                            />
                          )}
                          <RowAction
                            icon={Pencil}
                            title="Modifier"
                            titleRu="Изменить"
                            onClick={() => startEdit(e)}
                          />
                          <RowAction
                            icon={expandedId === e.id ? X : Eye}
                            title={expandedId === e.id ? "Fermer" : "Détails"}
                            titleRu={expandedId === e.id ? "Закрыть" : "Подробнее"}
                            onClick={() =>
                              setExpandedId(expandedId === e.id ? null : e.id)
                            }
                          />
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
        ))
      )}

      <Modal
        open={!!expandedId}
        onClose={() => setExpandedId(null)}
        title="Fiche salarié"
        maxWidth="max-w-3xl"
      >
        {expandedId &&
          (() => {
            const found = filtered.find((e) => e.id === expandedId);
            return found ? <EmployeeDetailPanel supabase={supabase} employee={found} /> : null;
          })()}
      </Modal>
    </div>
  );
}

// ── Panneau détail employé — profil étendu + confidentiel (RIB, SS, visa) ───

const SEX_OPTIONS = [
  { value: "M", label: "Homme" },
  { value: "F", label: "Femme" },
];

const CLASSIFICATION_OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((v) => ({
  value: v,
  label: v,
}));

const CONTRACT_TYPE_OPTIONS = [
  { value: "CDI", label: "CDI" },
  { value: "CDD", label: "CDD" },
  { value: "Intérim", label: "Intérim" },
  { value: "Apprentissage", label: "Apprentissage" },
  { value: "Contrat de professionnalisation", label: "Contrat de professionnalisation" },
  { value: "FOP", label: "FOP (sous-traitant)" },
];

const TSHIRT_SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL", "XXXL"].map((v) => ({
  value: v,
  label: v,
}));

const NATIONALITY_SUGGESTIONS = [
  "France",
  "Roumanie",
  "Ukraine",
  "Moldavie",
  "Russie",
  "Biélorussie",
  "Lituanie",
  "Kazakhstan",
];

const RESIDENCE_PERMIT_TYPE_SUGGESTIONS = [
  "Carte de séjour temporaire",
  "Carte de séjour pluriannuelle",
  "Carte de résident",
  "Autorisation provisoire de séjour (APS)",
  "Récépissé de demande de titre de séjour",
  "VLS-TS valant titre de séjour",
  "Passeport talent",
];

const QUALIFICATION_SUGGESTIONS = ["Salarié", "Intérimaire", "Stagiaire", "Apprenti"];

const JOB_TITLE_SUGGESTIONS = [
  "Ouvrier Poseur Système Photovoltaïque / Aide Électricien",
  "Assistante de direction",
  "Assistante opérationnelle",
  "Assistante administrative et opérationnelle",
  "Responsable du service planification",
  "Responsable finance",
  "Directrice des opérations",
  "Comptable",
  "Employé administratif",
  "RH",
];

const SHOE_SIZE_SUGGESTIONS = Array.from({ length: 11 }, (_, i) => String(38 + i));
const PANTALON_SIZE_SUGGESTIONS = ["38", "40", "42", "44", "46", "48", "50", "52", "S", "M", "L", "XL", "XXL"];

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
  badge_emoji: string | null;
  badge_label: string | null;
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

const AVATAR_PALETTE = [
  "bg-primary-100 text-primary-700",
  "bg-success-100 text-success-700",
  "bg-warning-100 text-warning-800",
  "bg-error-100 text-error-700",
  "bg-stone-200 text-stone-700",
];
function avatarColorClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}
function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

const STATUS_TONE: Record<EmployeeStatus, string> = {
  active: "bg-success-50 text-success-700",
  on_leave: "bg-warning-50 text-warning-700",
  terminated: "bg-error-50 text-error-700",
};

function DetailSection({
  title,
  titleRu,
  tone,
  children,
}: {
  title: string;
  titleRu?: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  return (
    <div className={`mb-5 rounded-xl ${tone === "warning" ? "bg-error-50/40 p-4" : ""}`}>
      <p
        className={`text-xs font-bold uppercase tracking-wide mb-2 ${
          tone === "warning" ? "text-error-500" : "text-stone-400"
        }`}
      >
        <Bi fr={title} ru={titleRu} />
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function EmployeeDetailPanel({
  supabase,
  employee,
}: {
  supabase: ReturnType<typeof createClient>;
  employee: EmployeeFull;
}) {
  const employeeId = employee.id;
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
            "sex, qualification, contract_type, job_title, device_label, hire_date, date_of_birth, phone, email, address, birth_place, classification, classe, weekly_hours, badge_emoji, badge_label"
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

  const roleOrTeam =
    employee.category === "bureau"
      ? BUREAU_ROLE_LABELS[employee.bureau_role ?? ""] ?? "Bureau"
      : employee.teams?.name ?? "Sans équipe";

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 pb-5 border-b border-stone-100">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${avatarColorClass(
            employee.id
          )}`}
        >
          {initialsOf(employee.first_name, employee.last_name)}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-extrabold tracking-tight text-stone-900 truncate">
            {employeeName(employee)}
            {profile.badge_emoji && (
              <span className="ml-1.5" title={profile.badge_label ?? undefined}>
                {profile.badge_emoji}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="badge badge-neutral">{roleOrTeam}</span>
            <span className={`badge ${STATUS_TONE[employee.status]}`}>{STATUS_LABELS[employee.status]}</span>
            {profile.badge_label && <span className="badge badge-primary">{profile.badge_label}</span>}
          </div>
        </div>
      </div>

      <DetailSection title="Badge" titleRu="Значок">
        <DetailField
          label="Emoji / Icône"
          labelRu="Эмодзи / Значок"
          value={profile.badge_emoji}
          onChange={(v) => setProfile({ ...profile, badge_emoji: v })}
        />
        <DetailField
          label="Libellé du badge"
          labelRu="Подпись значка"
          value={profile.badge_label}
          onChange={(v) => setProfile({ ...profile, badge_label: v })}
        />
      </DetailSection>

      <DetailSection title="Identité" titleRu="Личные данные">
        <DetailSelectField
          label="Sexe"
          labelRu="Пол"
          value={profile.sex}
          onChange={(v) => setProfile({ ...profile, sex: v })}
          options={SEX_OPTIONS}
        />
        <DetailField
          label="Date de naissance"
          labelRu="Дата рождения"
          type="date"
          value={profile.date_of_birth}
          onChange={(v) => setProfile({ ...profile, date_of_birth: v })}
        />
        <DetailField
          label="Lieu de naissance"
          labelRu="Место рождения"
          value={profile.birth_place}
          onChange={(v) => setProfile({ ...profile, birth_place: v })}
        />
        <DetailField
          label="Nationalité"
          labelRu="Гражданство"
          value={confidential.nationality}
          onChange={(v) => setConfidential({ ...confidential, nationality: v })}
          suggestions={NATIONALITY_SUGGESTIONS}
        />
      </DetailSection>

      <DetailSection title="Poste" titleRu="Должность">
        <DetailField
          label="Qualification"
          labelRu="Квалификация"
          value={profile.qualification}
          onChange={(v) => setProfile({ ...profile, qualification: v })}
          suggestions={QUALIFICATION_SUGGESTIONS}
        />
        <DetailField
          label="Poste / Emploi"
          labelRu="Должность"
          value={profile.job_title}
          onChange={(v) => setProfile({ ...profile, job_title: v })}
          suggestions={JOB_TITLE_SUGGESTIONS}
        />
        <DetailSelectField
          label="Type de contrat"
          labelRu="Тип контракта"
          value={profile.contract_type}
          onChange={(v) => setProfile({ ...profile, contract_type: v })}
          options={CONTRACT_TYPE_OPTIONS}
        />
        <DetailField
          label="Date d'embauche"
          labelRu="Дата приёма на работу"
          type="date"
          value={profile.hire_date}
          onChange={(v) => setProfile({ ...profile, hire_date: v })}
        />
        <DetailSelectField
          label="Classification (groupe A–I)"
          labelRu="Классификация (группа A–I)"
          value={profile.classification}
          onChange={(v) => setProfile({ ...profile, classification: v })}
          options={CLASSIFICATION_OPTIONS}
        />
        <DetailField
          label="Classe (coefficient)"
          labelRu="Класс (коэффициент)"
          value={profile.classe}
          onChange={(v) => setProfile({ ...profile, classe: v })}
        />
        <DetailField
          label="Heures hebdomadaires"
          labelRu="Часов в неделю"
          type="number"
          value={profile.weekly_hours?.toString() ?? null}
          onChange={(v) => setProfile({ ...profile, weekly_hours: v === "" ? null : Number(v) })}
        />
      </DetailSection>

      <DetailSection title="Contact" titleRu="Контакты">
        <DetailField
          label="Téléphone"
          labelRu="Телефон"
          value={profile.phone}
          onChange={(v) => setProfile({ ...profile, phone: v })}
        />
        <DetailField
          label="Email"
          labelRu="Эл. почта"
          value={profile.email}
          onChange={(v) => setProfile({ ...profile, email: v })}
        />
        <DetailField
          label="Adresse"
          labelRu="Адрес"
          value={profile.address}
          onChange={(v) => setProfile({ ...profile, address: v })}
        />
      </DetailSection>

      <DetailSection title="Confidentiel — RH uniquement" titleRu="Конфиденциально — только для кадров" tone="warning">
        <DetailField
          label="RIB"
          labelRu="Банковские реквизиты"
          value={confidential.rib}
          onChange={(v) => setConfidential({ ...confidential, rib: v })}
        />
        <DetailField
          label="Sécurité sociale"
          labelRu="Соц. страхование"
          value={confidential.securite_sociale}
          onChange={(v) =>
            setConfidential({ ...confidential, securite_sociale: v })
          }
        />
        <DetailField
          label="Statut Ameli"
          labelRu="Статус Ameli"
          value={confidential.status_ameli}
          onChange={(v) => setConfidential({ ...confidential, status_ameli: v })}
        />
        <DetailField
          label="Carte Vitale"
          labelRu="Карта Vitale"
          value={confidential.carte_vitale}
          onChange={(v) => setConfidential({ ...confidential, carte_vitale: v })}
        />
        <DetailField
          label="Mutuelle"
          labelRu="Страховка"
          value={confidential.mutuelle}
          onChange={(v) => setConfidential({ ...confidential, mutuelle: v })}
        />
        <DetailField
          label="Type de titre de séjour"
          labelRu="Тип вида на жительство"
          value={confidential.residence_permit_type}
          onChange={(v) =>
            setConfidential({ ...confidential, residence_permit_type: v })
          }
          suggestions={RESIDENCE_PERMIT_TYPE_SUGGESTIONS}
        />
        <DetailField
          label="N° du titre"
          labelRu="Номер документа"
          value={confidential.residence_permit_number}
          onChange={(v) =>
            setConfidential({ ...confidential, residence_permit_number: v })
          }
        />
        <DetailField
          label="Salaire mensuel brut (€)"
          labelRu="Оклад брутто в месяц (€)"
          type="number"
          value={confidential.monthly_gross_salary?.toString() ?? null}
          onChange={(v) =>
            setConfidential({
              ...confidential,
              monthly_gross_salary: v === "" ? null : Number(v),
            })
          }
        />
      </DetailSection>

      <div className="pt-1 border-t border-stone-100 mt-1">
        <button
          className="btn btn-green text-sm px-4 py-2 mt-4"
          disabled={saving}
          onClick={save}
        >
          {saving ? "…" : <Bi fr="Enregistrer" ru="Сохранить" />}
        </button>
        {savedAt && (
          <span className="ml-3 text-xs font-semibold text-success-600">
            Enregistré à {savedAt}
          </span>
        )}
      </div>
    </div>
  );
}

function DetailField({
  label,
  labelRu,
  value,
  onChange,
  type = "text",
  suggestions,
}: {
  label: string;
  labelRu?: string;
  value: string | null;
  onChange: (v: string) => void;
  type?: string;
  suggestions?: string[];
}) {
  const listId = suggestions ? `dl-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : undefined;
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase text-stone-400">
        <Bi fr={label} ru={labelRu} />
      </label>
      <input
        type={type}
        className="input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

function DetailSelectField({
  label,
  labelRu,
  value,
  onChange,
  options,
}: {
  label: string;
  labelRu?: string;
  value: string | null;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const knownValue = value != null && value !== "" && !options.some((o) => o.value === value);
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase text-stone-400">
        <Bi fr={label} ru={labelRu} />
      </label>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {knownValue && <option value={value!}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Vue "Médical" — RDV médecine du travail ─────────────────────────────────

const VISIT_SUBTYPE_OPTIONS = [
  "Embauche",
  "Visite périodique",
  "Visite intermédiaire (salarié SIR)",
  "Visite de mi-carrière",
  "Visite de reprise",
  "Visite de pré-reprise",
  "Affectation à un poste à risque non SIR",
  "Visite occasionnelle / à la demande",
].map((v) => ({ value: v, label: v }));

type MedicalVisit = {
  id: string;
  employee_id: string;
  last_visit_date: string | null;
  next_visit_date: string | null;
  next_visit_time: string | null;
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
    nextTime: string;
    subtype: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [teamFilter, setTeamFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showPrevalyModal, setShowPrevalyModal] = useState(false);
  const [importingPrevaly, setImportingPrevaly] = useState(false);
  const [prevalyResult, setPrevalyResult] = useState<{
    updatedCount: number;
    unmatched: string[];
  } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("medical_visits")
        .select(
          "id, employee_id, last_visit_date, next_visit_date, next_visit_time, visit_subtype, employees(first_name, last_name, team_id, teams!employees_team_id_fkey(name))"
        )
        .order("next_visit_date", { ascending: true, nullsFirst: false });
      setVisits((data as unknown as MedicalVisit[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase, refreshKey]);

  async function applyPrevalyImport(file: File) {
    setImportingPrevaly(true);
    setPrevalyResult(null);
    try {
      const rawText = await file.text();
      const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        toast.error("Fichier vide.");
        return;
      }
      const headers = parseCsvLine(lines[0], ";").map((h) => h.trim());
      const iPrenom = headers.indexOf("Prénom");
      const iNom = headers.indexOf("Nom");
      const iNomNaissance = headers.indexOf("Nom_de_naissance");
      const iLastVisit = headers.indexOf("Date_de_dernière_visite");
      const iNextVisit = headers.indexOf("Date_de_prochaine_visite_estimée");
      const iSubtype = headers.indexOf("Sous_type_de_prochaine_visite_estimé");
      const iType = headers.indexOf("Type_de_prochaine_visite_estimé");

      if (iPrenom === -1 || iNom === -1) {
        toast.error("Colonnes Prénom/Nom introuvables dans le fichier.");
        return;
      }

      const [{ data: empRows }, { data: existingVisits }] = await Promise.all([
        supabase.from("employees").select("id, first_name, last_name"),
        supabase.from("medical_visits").select("id, employee_id"),
      ]);

      const byName = new Map<string, string>();
      ((empRows ?? []) as { id: string; first_name: string; last_name: string }[]).forEach((e) =>
        byName.set(`${e.first_name.trim().toLowerCase()}|${e.last_name.trim().toLowerCase()}`, e.id)
      );
      const existingByEmployee = new Map<string, string>();
      ((existingVisits ?? []) as { id: string; employee_id: string }[]).forEach((v) =>
        existingByEmployee.set(v.employee_id, v.id)
      );

      const unmatched: string[] = [];
      const updates: {
        id: string;
        last_visit_date: string | null;
        next_visit_date: string | null;
        visit_subtype: string | null;
      }[] = [];
      const inserts: {
        employee_id: string;
        last_visit_date: string | null;
        next_visit_date: string | null;
        visit_subtype: string | null;
      }[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i], ";");
        const prenom = (cols[iPrenom] ?? "").trim();
        const nom = (cols[iNom] ?? "").trim();
        if (!prenom && !nom) continue;

        let employeeId = byName.get(`${prenom.toLowerCase()}|${nom.toLowerCase()}`);
        if (!employeeId && iNomNaissance !== -1) {
          const nomNaissance = (cols[iNomNaissance] ?? "").trim();
          employeeId = byName.get(`${prenom.toLowerCase()}|${nomNaissance.toLowerCase()}`);
        }
        if (!employeeId) {
          unmatched.push(`${nom} ${prenom}`.trim());
          continue;
        }

        const lastVisit = iLastVisit !== -1 ? parseFrDateToIso(cols[iLastVisit] ?? "") : null;
        const nextVisit = iNextVisit !== -1 ? parseFrDateToIso(cols[iNextVisit] ?? "") : null;
        let subtype = iSubtype !== -1 ? (cols[iSubtype] ?? "").trim() : "";
        if (!subtype && iType !== -1) subtype = (cols[iType] ?? "").trim();
        const visitSubtype = subtype && subtype !== "-" ? subtype : null;

        const existingId = existingByEmployee.get(employeeId);
        if (existingId) {
          updates.push({ id: existingId, last_visit_date: lastVisit, next_visit_date: nextVisit, visit_subtype: visitSubtype });
        } else {
          inserts.push({ employee_id: employeeId, last_visit_date: lastVisit, next_visit_date: nextVisit, visit_subtype: visitSubtype });
        }
      }

      const results = await Promise.all([
        ...updates.map((u) =>
          supabase
            .from("medical_visits")
            .update({
              last_visit_date: u.last_visit_date,
              next_visit_date: u.next_visit_date,
              visit_subtype: u.visit_subtype,
            })
            .eq("id", u.id)
        ),
        inserts.length > 0
          ? supabase.from("medical_visits").insert(inserts)
          : Promise.resolve({ error: null } as { error: { message: string } | null }),
      ]);
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        toast.error("Erreur : " + failed.error.message);
      } else {
        toast.success(`${updates.length + inserts.length} visite(s) mise(s) à jour.`);
      }
      setPrevalyResult({ updatedCount: updates.length + inserts.length, unmatched });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error("Erreur de lecture du fichier : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImportingPrevaly(false);
    }
  }

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
      nextTime: v.next_visit_time ? v.next_visit_time.slice(0, 5) : "",
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
        next_visit_time: editForm.nextTime || null,
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
  const visitHorizon = addDaysIsoLocal(todayIso, 90);
  function visitGroupKey(v: MedicalVisit): "urgent" | "later" {
    return v.next_visit_date && v.next_visit_date <= visitHorizon ? "urgent" : "later";
  }
  /** Visite médicale obligatoire tous les 3 ans — signale qu'il faut prendre
   *  un nouveau rendez-vous dès que 3 ans se sont écoulés depuis la dernière visite. */
  function needsNewAppointment(v: MedicalVisit): boolean {
    if (!v.last_visit_date) return false;
    return v.last_visit_date <= addDaysIsoLocal(todayIso, -3 * 365);
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div className="font-bold flex items-center">
            Visites médicales ({filteredVisits.length}/{visits.length})
            <InfoNote
              title="Médical"
              text={
                "Медосмотры каждого сотрудника: дата последнего визита, дата и время следующего.\n\n" +
                "Записи с визитом в ближайшие 3 месяца показаны отдельным блоком сверху. Восклицательный знак у даты последнего визита означает, что прошло больше 3 лет — по закону пора записываться на новый медосмотр.\n\n" +
                "Кнопка «Importer Prevaly» загружает выгрузку из системы Prevaly и подставляет даты визитов автоматически, сопоставляя по имени и фамилии."
              }
            />
          </div>
          <button
            className="btn btn-secondary text-sm"
            onClick={() => {
              setPrevalyResult(null);
              setShowPrevalyModal(true);
            }}
          >
            <Upload size={15} /> <Bi fr="Importer Prevaly" ru="Импорт из Prevaly" />
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Recherche" ru="Поиск" />
            </label>
            <input
              className="input"
              placeholder="Nom, prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Équipe" ru="Бригада" />
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
          <EmptyState titleRu="Нет результатов" description="Aucune visite ne correspond à ces filtres." />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-400">
                <th className="pb-2 pr-4"><Bi fr="Nom" ru="Фамилия" /></th>
                <th className="pb-2 pr-4"><Bi fr="Dernière visite" ru="Последний визит" /></th>
                <th className="pb-2 pr-4"><Bi fr="Prochaine visite" ru="Следующий визит" /></th>
                <th className="pb-2 pr-4"><Bi fr="Sous-type" ru="Подтип" /></th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filteredVisits.map((v, idx) => {
                const isEditing = editingId === v.id;
                const isOverdue = !!v.next_visit_date && v.next_visit_date < todayIso;
                const groupKey = visitGroupKey(v);
                const showGroupHeader = idx === 0 || visitGroupKey(filteredVisits[idx - 1]) !== groupKey;
                return (
                  <Fragment key={v.id}>
                  {showGroupHeader && (
                    <tr>
                      <td colSpan={5} className={idx === 0 ? "p-0" : "pt-4 p-0"}>
                        <p
                          className={`px-4 py-2 text-xs font-bold uppercase tracking-wide ${
                            groupKey === "urgent"
                              ? "bg-warning-500 text-white"
                              : "bg-stone-100 text-stone-500"
                          }`}
                        >
                          {groupKey === "urgent" ? (
                            <Bi fr="Dans les 3 prochains mois" ru="В ближайшие 3 месяца" />
                          ) : (
                            <Bi fr="Plus tard / sans date" ru="Позже / без даты" />
                          )}
                        </p>
                      </td>
                    </tr>
                  )}
                  <tr className={`border-t border-stone-100 ${groupKey === "urgent" ? "bg-warning-100" : ""}`}>
                    <td className="py-2 pr-4 font-semibold">
                      {v.employees ? employeeName(v.employees) : "—"}
                    </td>
                    {isEditing && editForm ? (
                      <>
                        <td className="py-2 pr-4">
                          <input
                            type="date"
                            className="input text-sm px-2 py-1"
                            value={editForm.last}
                            onChange={(e) =>
                              setEditForm({ ...editForm, last: e.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-1">
                            <input
                              type="date"
                              className="input text-sm px-2 py-1"
                              value={editForm.next}
                              onChange={(e) =>
                                setEditForm({ ...editForm, next: e.target.value })
                              }
                            />
                            <input
                              type="time"
                              title="Heure du rendez-vous / Время встречи"
                              className="input text-sm px-2 py-1"
                              style={{ width: "6rem" }}
                              value={editForm.nextTime}
                              onChange={(e) =>
                                setEditForm({ ...editForm, nextTime: e.target.value })
                              }
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className="input text-sm px-2 py-1"
                            value={editForm.subtype}
                            onChange={(e) =>
                              setEditForm({ ...editForm, subtype: e.target.value })
                            }
                          >
                            <option value="">—</option>
                            {editForm.subtype &&
                              !VISIT_SUBTYPE_OPTIONS.some((o) => o.value === editForm.subtype) && (
                                <option value={editForm.subtype}>{editForm.subtype}</option>
                              )}
                            {VISIT_SUBTYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          <button
                            className="btn btn-green text-xs px-3 py-1 mr-2"
                            disabled={saving}
                            onClick={() => saveEdit(v)}
                          >
                            <Bi fr="Enregistrer" ru="Сохранить" />
                          </button>
                          <button
                            className="text-xs text-stone-400 underline"
                            onClick={() => setEditingId(null)}
                          >
                            <Bi fr="Annuler" ru="Отмена" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4">
                          {v.last_visit_date ?? "—"}
                          {needsNewAppointment(v) && (
                            <span
                              className="ml-1 inline-block align-text-bottom text-error-600"
                              title="Plus de 3 ans depuis la dernière visite — rendez-vous à prendre / Прошло больше 3 лет с последнего визита — нужно записаться"
                            >
                              <AlertTriangle size={14} className="inline shrink-0" />
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-2 pr-4 font-semibold ${
                            isOverdue ? "text-error-600" : ""
                          }`}
                        >
                          {v.next_visit_date ?? "—"}
                          {v.next_visit_date && v.next_visit_time && (
                            <span className="ml-1 font-normal text-stone-400">
                              {v.next_visit_time.slice(0, 5)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-stone-500">
                          {v.visit_subtype ?? "—"}
                        </td>
                        <td className="py-2">
                          <RowAction
                            icon={Pencil}
                            title="Modifier"
                            titleRu="Изменить"
                            onClick={() => startEdit(v)}
                          />
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
        open={showPrevalyModal}
        onClose={() => setShowPrevalyModal(false)}
        title="Importer depuis Prevaly"
        maxWidth="max-w-lg"
      >
        <p className="text-sm text-stone-500 mb-3">
          Sélectionnez l&apos;export CSV de Prevaly (salaries-….csv). On y récupère le nom, la
          date de dernière visite, la date de prochaine visite estimée et son sous-type — le
          reste des colonnes est ignoré.{" "}
          <span className="opacity-70">
            / Выберите CSV-выгрузку из Prevaly. Оттуда берутся имя, дата последнего визита, дата
            следующего визита и его подтип — остальные столбцы игнорируются.
          </span>
        </p>
        <label className={`btn btn-secondary inline-flex ${importingPrevaly ? "" : "cursor-pointer"}`}>
          <Upload size={14} />{" "}
          {importingPrevaly ? "Import en cours…" : <Bi fr="Choisir un fichier" ru="Выбрать файл" />}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            disabled={importingPrevaly}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) applyPrevalyImport(file);
            }}
          />
        </label>
        {prevalyResult && (
          <div className="mt-3 text-sm">
            <p className="text-success-600 font-semibold">
              {prevalyResult.updatedCount} visite(s) mise(s) à jour.
            </p>
            {prevalyResult.unmatched.length > 0 && (
              <div className="mt-1 text-error-600">
                <p className="font-semibold">
                  Non reconnu(s) : <span className="opacity-70">/ Не найдено:</span>
                </p>
                <ul className="list-disc pl-5">
                  {prevalyResult.unmatched.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3 mt-4">
          <button className="btn btn-secondary text-sm px-3 py-2" onClick={() => setShowPrevalyModal(false)}>
            <Bi fr="Fermer" ru="Закрыть" />
          </button>
        </div>
      </Modal>
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
        <div className="font-bold flex items-center">
          Formations & habilitations ({filteredEmployees.length}/{employees.length})
          <InfoNote
            title="Formations"
            text={
              "Отметки о пройденных обучениях по каждому сотруднику и виду обучения (например, CACES, работа на высоте). Нажмите на ячейку, чтобы переключить статус OK/KO.\n\n" +
              "Здесь нет дат истечения. Если для документа важна дата действия (например, «Habilitation»), загружайте его в разделе «Dossier salarié» — оттуда он попадёт в «Notifications», когда срок будет подходить."
            }
          />
        </div>
        <p className="text-xs text-stone-400 mb-3">
          Cliquer une cellule pour basculer OK / KO.{" "}
          <span className="opacity-70">/ Нажмите на ячейку, чтобы переключить OK / KO.</span>
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Recherche" ru="Поиск" />
            </label>
            <input
              className="input"
              placeholder="Nom, prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Équipe" ru="Бригада" />
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
          <EmptyState titleRu="Нет результатов" description="Aucun employé ne correspond à ces filtres." />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-400">
                <th className="pb-2 pr-4"><Bi fr="Nom" ru="Фамилия" /></th>
                <th className="pb-2 pr-4"><Bi fr="Équipe" ru="Бригада" /></th>
                {types.map((t) => (
                  <th key={t.id} className="pb-2 px-2 text-center" title={t.label}>
                    {t.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((e) => (
                <tr key={e.id} className="border-t border-stone-100">
                  <td className="py-2 pr-4 font-semibold">{employeeName(e)}</td>
                  <td className="py-2 pr-4 text-stone-500">
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
                              : "bg-stone-100 text-stone-400"
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
        <div className="font-bold flex items-center">
          Tailles / équipement ({filteredEmployees.length}/{employees.length})
          <InfoNote
            title="Tailles"
            text={
              "Размеры спецодежды и обуви по каждому сотруднику: обувь, брюки, футболка.\n\n" +
              "У полей есть подсказки — начните вводить или откройте список, и появятся частые значения, но можно вписать и своё, если нужного размера нет в списке."
            }
          />
        </div>
        <div className="flex flex-wrap items-end gap-3 mt-3">
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Recherche" ru="Поиск" />
            </label>
            <input
              className="input"
              placeholder="Nom, prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-400">
              <Bi fr="Équipe" ru="Бригада" />
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
          <EmptyState titleRu="Нет результатов" description="Aucun employé ne correspond à ces filtres." />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-400">
                <th className="pb-2 pr-4"><Bi fr="Nom" ru="Фамилия" /></th>
                <th className="pb-2 pr-4"><Bi fr="Chaussures" ru="Обувь" /></th>
                <th className="pb-2 pr-4"><Bi fr="Pantalon" ru="Брюки" /></th>
                <th className="pb-2 pr-4"><Bi fr="T-shirt" ru="Футболка" /></th>
                <th className="pb-2 pr-4"><Bi fr="Notes" ru="Заметки" /></th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((e) => {
                const s = sizeByEmployee.get(e.id);
                const isEditing = editingId === e.id;
                return (
                  <tr key={e.id} className="border-t border-stone-100">
                    <td className="py-2 pr-4 font-semibold">{employeeName(e)}</td>
                    {isEditing && editForm ? (
                      <>
                        <td className="py-2 pr-4">
                          <input
                            className="input text-sm px-2 py-1"
                            style={{ width: "5rem" }}
                            value={editForm.chaussures}
                            list="dl-chaussures"
                            onChange={(ev) =>
                              setEditForm({ ...editForm, chaussures: ev.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            className="input text-sm px-2 py-1"
                            style={{ width: "5rem" }}
                            value={editForm.pantalon}
                            list="dl-pantalon"
                            onChange={(ev) =>
                              setEditForm({ ...editForm, pantalon: ev.target.value })
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            className="input text-sm px-2 py-1"
                            style={{ width: "5rem" }}
                            value={editForm.tshirt}
                            onChange={(ev) =>
                              setEditForm({ ...editForm, tshirt: ev.target.value })
                            }
                          >
                            <option value="">—</option>
                            {editForm.tshirt &&
                              !TSHIRT_SIZE_OPTIONS.some((o) => o.value === editForm.tshirt) && (
                                <option value={editForm.tshirt}>{editForm.tshirt}</option>
                              )}
                            {TSHIRT_SIZE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            className="input text-sm px-2 py-1"
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
                            <Bi fr="Enregistrer" ru="Сохранить" />
                          </button>
                          <button
                            className="text-xs text-stone-400 underline"
                            onClick={() => setEditingId(null)}
                          >
                            <Bi fr="Annuler" ru="Отмена" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4 text-stone-500">
                          {s?.chaussures ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-stone-500">
                          {s?.pantalon ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-stone-500">
                          {s?.tshirt ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-stone-500">{s?.notes ?? "—"}</td>
                        <td className="py-2">
                          <RowAction
                            icon={Pencil}
                            title="Modifier"
                            titleRu="Изменить"
                            onClick={() => startEdit(e.id)}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="dl-chaussures">
            {SHOE_SIZE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="dl-pantalon">
            {PANTALON_SIZE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
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
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
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
        <div className="font-bold mb-3">
          <Bi
            fr={`Employés (${filteredEmployees.length})`}
            ru="Сотрудники"
            after={
              <InfoNote
                title="Documents"
                text={
                  "Здесь создаются готовые документы: трудовые договоры, письма о расторжении, уведомления, приглашения на собеседование и т.д.\n\n" +
                  "Выберите сотрудника слева, тип документа сверху справа — часть полей уже подставится из карточки сотрудника, остальное впишите вручную — и скачайте готовый файл в PDF или Word."
                }
              />
            }
          />
        </div>
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
          <option value="active">Actifs / Активны</option>
          <option value="on_leave">En congé / В отпуске</option>
          <option value="terminated">Sortis / Уволены</option>
          <option value="all">Tous / Все</option>
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
                    ? "bg-stone-900 text-white font-bold"
                    : "hover:bg-stone-50 text-stone-600"
                }`}
              >
                {employeeName(e)}
                <span className="block text-xs opacity-60">
                  {e.category === "bureau" ? "Bureau" : "Chantier"}
                </span>
              </button>
            ))}
            {filteredEmployees.length === 0 && (
              <p className="text-sm text-stone-400 px-1">
                Aucun résultat. <span className="opacity-70">/ Нет результатов.</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 card">
        {!selectedEmployeeId ? (
          <p className="text-stone-400">
            Sélectionnez un employé à gauche.{" "}
            <span className="opacity-70">/ Выберите сотрудника слева.</span>
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-lg">
                {employeeDoc ? employeeDoc.fullNameUpper : "…"}
              </p>
              <button
                type="button"
                className="input flex w-72 shrink-0 items-center justify-between gap-2 text-left"
                onClick={() => setTypeMenuOpen(true)}
              >
                <Bi fr={definition?.label ?? ""} ru={definition?.labelRu} className="min-w-0" />
                <ChevronDown size={16} className="shrink-0 text-stone-400" />
              </button>
            </div>

            <Modal
              open={typeMenuOpen}
              onClose={() => setTypeMenuOpen(false)}
              title="Type de document"
              maxWidth="max-w-xl"
            >
              <div className="-my-1 space-y-0.5">
                {DOCUMENT_TYPES.map((d) => (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => {
                      setTypeCode(d.code);
                      setTypeMenuOpen(false);
                    }}
                    className={`block w-full rounded-lg px-3 py-2 text-left ${
                      d.code === typeCode
                        ? "bg-primary-50 text-primary-700"
                        : "hover:bg-stone-50 text-stone-700"
                    }`}
                  >
                    <Bi fr={d.label} ru={d.labelRu} className="block w-full" />
                  </button>
                ))}
              </div>
            </Modal>

            {definition?.descriptionRu && (
              <p className="text-xs text-stone-400 mb-4 -mt-2">{definition.descriptionRu}</p>
            )}

            {definition?.legalRisk && (
              <div className="rounded-xl bg-warning-50 border border-warning-200 text-warning-800 text-sm px-3 py-2 mb-4">
                <p>
                  Brouillon — à vérifier avant envoi. Ce document engage l&apos;entreprise ;
                  relisez-le (et faites-le relire si besoin) avant signature ou envoi au
                  salarié.
                </p>
                <p className="opacity-70 mt-1">
                  Черновик — проверьте перед отправкой. Этот документ юридически обязывает
                  компанию; перечитайте его (и дайте перечитать кому-то ещё при необходимости)
                  перед подписанием или отправкой сотруднику.
                </p>
              </div>
            )}

            {loadingDetail || !employeeDoc || !companyDoc ? (
              <p className="text-stone-400">
                Chargement des données de l&apos;employé…{" "}
                <span className="opacity-70">/ Загрузка данных сотрудника…</span>
              </p>
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
                      <Bi fr={f.label} ru={f.labelRu} />
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
                              {opt.labelRu ? ` / ${opt.labelRu}` : ""}
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
                        <span className="block text-xs font-normal text-stone-400 mt-1">
                          {f.help}
                          {f.helpRu && <span className="block opacity-70">{f.helpRu}</span>}
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                {missingRequired.length > 0 && (
                  <p className="text-sm text-error-500 mb-3">
                    Champs obligatoires manquants <span className="opacity-70">/ Не заполнены обязательные поля</span> :{" "}
                    {missingRequired.map((f) => (f.labelRu ? `${f.label} / ${f.labelRu}` : f.label)).join(", ")}
                  </p>
                )}
                {errorMsg && <p className="text-sm text-error-500 mb-3">{errorMsg}</p>}

                <div className="flex gap-3">
                  <button
                    className="btn btn-dark"
                    disabled={missingRequired.length > 0 || generating !== null}
                    onClick={() => download("docx")}
                  >
                    {generating === "docx" ? (
                      <Bi fr="Génération…" ru="Создание…" />
                    ) : (
                      <Bi fr="Télécharger Word (.docx)" ru="Скачать Word (.docx)" />
                    )}
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={missingRequired.length > 0 || generating !== null}
                    onClick={() => download("pdf")}
                  >
                    {generating === "pdf" ? (
                      <Bi fr="Génération…" ru="Создание…" />
                    ) : (
                      <Bi fr="Télécharger PDF" ru="Скачать PDF" />
                    )}
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

// ── Vue "Calculateur de rupture" — préavis, procédure RC et indemnités ──────
function ageFromBirthDate(dobIso: string, refIso: string): number {
  const dob = new Date(dobIso + "T00:00:00Z");
  const ref = new Date(refIso + "T00:00:00Z");
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const m = ref.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

const RUPTURE_TYPE_OPTIONS: { value: RuptureType; label: string; labelRu: string }[] = [
  { value: "Démission", label: "Démission", labelRu: "По собственному желанию" },
  { value: "Licenciement", label: "Licenciement", labelRu: "По инициативе работодателя" },
  { value: "RC", label: "Rupture conventionnelle (RC)", labelRu: "По соглашению сторон (RC)" },
];

function RuptureView({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const [employees, setEmployees] = useState<DocEmployeeListRow[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("active");
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeDoc, setEmployeeDoc] = useState<EmployeeDoc | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [group, setGroup] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [age, setAge] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [cpBalanceDays, setCpBalanceDays] = useState("");
  const [ruptureType, setRuptureType] = useState<RuptureType>("Démission");
  const [desiredRuptureDate, setDesiredRuptureDate] = useState("");
  const [dispensePreavis, setDispensePreavis] = useState(false);

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
      const doc = data ? mapEmployeeRow(data) : null;
      setEmployeeDoc(doc);
      setLoadingDetail(false);
      setGroup(doc?.classification ?? "");
      setHireDate(doc?.hireDate ?? "");
      setAge(doc?.dateOfBirth ? String(ageFromBirthDate(doc.dateOfBirth, today())) : "");
      setMonthlySalary(doc?.monthlyGrossSalary != null ? String(doc.monthlyGrossSalary) : "");
      setCpBalanceDays("");
      setRuptureType("Démission");
      setDesiredRuptureDate("");
      setDispensePreavis(false);
    }
    load();
  }, [supabase, selectedEmployeeId]);

  const result = useMemo(
    () =>
      computeRupture({
        hireDate: hireDate || null,
        group,
        age: age === "" ? null : Number(age),
        monthlyGrossSalary: monthlySalary === "" ? null : Number(monthlySalary),
        cpBalanceDays: cpBalanceDays === "" ? null : Number(cpBalanceDays),
        ruptureType,
        desiredRuptureDate: desiredRuptureDate || null,
        dispensePreavis,
      }),
    [hireDate, group, age, monthlySalary, cpBalanceDays, ruptureType, desiredRuptureDate, dispensePreavis]
  );

  const needsAgeForBracket =
    ["F", "G", "H", "I"].includes(group) &&
    ruptureType === "Licenciement" &&
    result !== null &&
    result.ancienneteDecimalYears >= 3 &&
    age === "";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (q && !employeeName(e).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, statusFilter, search]);

  return (
    <div className="flex gap-4 items-start">
      <div className="card w-72 shrink-0">
        <p className="font-bold mb-3 flex items-center">
          <Bi fr="Employés" ru="Сотрудники" />
          <InfoNote
            title="Calculateur de rupture"
            text={
              "Считает срок предупреждения (préavis), процедуру расторжения по соглашению сторон (RC) и примерные выплаты при увольнении — по правилам Convention Collective Métallurgie.\n\n" +
              "Выберите сотрудника слева — часть полей подставится автоматически (дата приёма, группа, возраст, зарплата), остальное впишите вручную: остаток отпуска, тип увольнения и желаемую дату.\n\n" +
              "Это расчёт-подсказка, не готовый документ — для реального увольнения всегда проверяйте цифры и при спорных случаях консультируйтесь с юристом."
            }
          />
        </p>
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
          <option value="active">Actifs / Активны</option>
          <option value="on_leave">En congé / В отпуске</option>
          <option value="terminated">Sortis / Уволены</option>
          <option value="all">Tous / Все</option>
        </select>
        {loadingEmployees ? (
          <SkeletonRows rows={4} cols={1} />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto -mx-1">
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedEmployeeId(e.id)}
                className={`w-full text-left rounded-xl px-3 py-2 text-sm mb-1 ${
                  selectedEmployeeId === e.id
                    ? "bg-stone-900 text-white font-bold"
                    : "hover:bg-stone-50 text-stone-600"
                }`}
              >
                {employeeName(e)}
                <span className="block text-xs opacity-60">
                  {e.category === "bureau" ? "Bureau" : "Chantier"}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-stone-400 px-1">
                Aucun résultat. <span className="opacity-70">/ Нет результатов.</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 card">
        {!selectedEmployeeId ? (
          <p className="text-stone-400">
            Sélectionnez un employé à gauche.{" "}
            <span className="opacity-70">/ Выберите сотрудника слева.</span>
          </p>
        ) : loadingDetail ? (
          <SkeletonRows rows={4} cols={2} />
        ) : (
          <>
            <p className="font-bold text-lg mb-4">
              {employeeDoc ? employeeDoc.fullNameUpper : "…"}
            </p>

            <DetailSection title="Données salariées" titleRu="Данные сотрудника">
              <DetailSelectField
                label="Groupe d'emploi (A–I)"
                labelRu="Группа занятости (A–I)"
                value={group}
                onChange={setGroup}
                options={CLASSIFICATION_OPTIONS}
              />
              <DetailField
                label="Date d'entrée"
                labelRu="Дата приёма на работу"
                type="date"
                value={hireDate}
                onChange={setHireDate}
              />
              <DetailField label="Âge (années)" labelRu="Возраст (лет)" type="number" value={age} onChange={setAge} />
              <DetailField
                label="Salaire brut mensuel (€)"
                labelRu="Оклад брутто в месяц (€)"
                type="number"
                value={monthlySalary}
                onChange={setMonthlySalary}
              />
              <DetailField
                label="Solde de CP (jours ouvrés)"
                labelRu="Остаток отпуска (раб. дни)"
                type="number"
                value={cpBalanceDays}
                onChange={setCpBalanceDays}
              />
              <DetailSelectField
                label="Type de rupture"
                labelRu="Тип увольнения"
                value={ruptureType}
                onChange={(v) => setRuptureType(v as RuptureType)}
                options={RUPTURE_TYPE_OPTIONS}
              />
              <DetailField
                label="Date de rupture souhaitée"
                labelRu="Желаемая дата увольнения"
                type="date"
                value={desiredRuptureDate}
                onChange={setDesiredRuptureDate}
              />
              {ruptureType === "Licenciement" && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-stone-400">
                    <Bi fr="Dispensé de préavis ?" ru="Освобождение от отработки?" />
                  </label>
                  <input
                    type="checkbox"
                    className="mt-2"
                    checked={dispensePreavis}
                    onChange={(e) => setDispensePreavis(e.target.checked)}
                  />
                </div>
              )}
            </DetailSection>

            {!hireDate || !desiredRuptureDate ? (
              <p className="text-sm text-stone-400">
                Renseignez la date d&apos;entrée et la date de rupture souhaitée pour voir le calcul.{" "}
                <span className="opacity-70">
                  / Укажите дату приёма на работу и желаемую дату увольнения, чтобы увидеть расчёт.
                </span>
              </p>
            ) : (
              result && (
                <>
                  <DetailSection title="Ancienneté & préavis" titleRu="Стаж и срок предупреждения">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-400">
                        <Bi fr="Ancienneté à la rupture" ru="Стаж на дату увольнения" />
                      </label>
                      <p className="mt-2 font-semibold text-stone-800">
                        {result.ancienneteYears} an(s) {result.ancienneteMonths} mois
                      </p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-400">
                        <Bi fr="Durée du préavis" ru="Срок предупреждения" />
                      </label>
                      <p className="mt-2 font-semibold text-stone-800">
                        {result.preavisDays === null ? "—" : `${result.preavisDays} jours calendaires`}
                      </p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-400">
                        <Bi fr="Date de notification / début préavis" ru="Дата уведомления" />
                      </label>
                      <p className="mt-2 font-semibold text-stone-800">{result.notificationDate ?? "—"}</p>
                    </div>
                  </DetailSection>

                  {needsAgeForBracket && (
                    <div className="rounded-xl bg-warning-50 border border-warning-200 text-warning-800 text-sm px-3 py-2 mb-4">
                      Groupe F–I avec 3 ans d&apos;ancienneté ou plus : l&apos;âge du salarié est
                      nécessaire pour déterminer le préavis exact.{" "}
                      <span className="opacity-70">
                        / Группа F–I со стажем от 3 лет — нужен возраст сотрудника, чтобы точно
                        определить срок предупреждения.
                      </span>
                    </div>
                  )}

                  {result.rc && (
                    <DetailSection title="Procédure — Rupture conventionnelle" titleRu="Процедура RC">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-stone-400">
                          <Bi fr="Convocation — au plus tard" ru="Приглашение на встречу — не позднее" />
                        </label>
                        <p className="mt-2 font-semibold text-stone-800">{result.rc.convocationDeadline}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-stone-400">
                          <Bi fr="Entretien + signature — au plus tard" ru="Собеседование + подпись — не позднее" />
                        </label>
                        <p className="mt-2 font-semibold text-stone-800">{result.rc.entretienSignatureDeadline}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-stone-400">
                          <Bi fr="Fin du délai de rétractation" ru="Конец срока отзыва" />
                        </label>
                        <p className="mt-2 font-semibold text-stone-800">{result.rc.finRetractation}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-stone-400">
                          <Bi fr="Dépôt auprès de la DREETS" ru="Подача в DREETS" />
                        </label>
                        <p className="mt-2 font-semibold text-stone-800">{result.rc.depotDreets}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-stone-400">
                          <Bi fr="Début du délai d'instruction DREETS" ru="Начало срока рассмотрения" />
                        </label>
                        <p className="mt-2 font-semibold text-stone-800">{result.rc.debutInstruction}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-stone-400">
                          <Bi fr="Validation tacite DREETS" ru="Молчаливое одобрение DREETS" />
                        </label>
                        <p className="mt-2 font-semibold text-stone-800">{result.rc.validationTacite}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-stone-400">
                          <Bi fr="Rupture effective du contrat" ru="Фактическая дата расторжения" />
                        </label>
                        <p className="mt-2 font-semibold text-stone-800">{result.rc.ruptureEffective}</p>
                      </div>
                    </DetailSection>
                  )}

                  <DetailSection title="Indemnités & solde de tout compte" titleRu="Выплаты при увольнении">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-400">
                        <Bi fr="Indemnité RC / légale de licenciement" ru="Выходное пособие RC / при увольнении" />
                      </label>
                      <p className="mt-2 font-semibold text-stone-800">
                        {ruptureType === "Démission" ? "—" : `${result.indemniteRuptureOuLicenciement.toFixed(2)} €`}
                      </p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-400">
                        <Bi fr="Indemnité compensatrice de CP" ru="Компенсация за неиспользованный отпуск" />
                      </label>
                      <p className="mt-2 font-semibold text-stone-800">{result.indemniteCP.toFixed(2)} €</p>
                    </div>
                    {dispensePreavis && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-stone-400">
                          <Bi fr="Indemnité compensatrice de préavis" ru="Компенсация за неотработанный срок" />
                        </label>
                        <p className="mt-2 font-semibold text-stone-800">
                          {result.indemnitePreavisCompensatoire.toFixed(2)} €
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-400">
                        <Bi fr="TOTAL SOLDE DE TOUT COMPTE" ru="ИТОГО к выплате при увольнении" />
                      </label>
                      <p className="mt-2 font-extrabold text-lg text-stone-900">{result.total.toFixed(2)} € brut</p>
                    </div>
                  </DetailSection>

                  <p className="text-xs text-stone-400 mt-2">
                    ⚠ Ces calculs sont des estimations basées sur les règles de la convention
                    collective Métallurgie et le Code du travail. Consultez un juriste pour tout
                    dossier litigieux.
                    <span className="block opacity-70">
                      Это ориентировочный расчёт по правилам конвенции Métallurgie и трудового
                      кодекса. По спорным случаям консультируйтесь с юристом.
                    </span>
                  </p>
                </>
              )
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

const REGISTRE_FIELD_LABELS: { key: keyof RegistreEditForm; label: string; labelRu: string; type: "text" | "date" | "select" }[] = [
  { key: "numero", label: "N°", labelRu: "№", type: "text" },
  { key: "nom_prenom", label: "Nom Prénom", labelRu: "Фамилия Имя", type: "text" },
  { key: "date_entree", label: "Date d'entrée", labelRu: "Дата приёма", type: "date" },
  { key: "nationalite", label: "Nationalité", labelRu: "Гражданство", type: "select" },
  { key: "date_naissance", label: "Date de naissance", labelRu: "Дата рождения", type: "date" },
  { key: "sexe", label: "Sexe (M/F)", labelRu: "Пол (M/F)", type: "select" },
  { key: "emploi", label: "Emploi", labelRu: "Должность", type: "text" },
  { key: "qualification", label: "Qualification", labelRu: "Квалификация", type: "text" },
  { key: "type_titre", label: "Type de titre", labelRu: "Тип документа", type: "select" },
  { key: "numero_titre", label: "N° du titre", labelRu: "Номер документа", type: "text" },
  { key: "type_contrat", label: "Type de contrat", labelRu: "Тип контракта", type: "select" },
  { key: "temps_partiel", label: "Temps partiel", labelRu: "Неполная занятость", type: "text" },
  { key: "date_sortie", label: "Date de sortie", labelRu: "Дата увольнения", type: "date" },
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

// ── Vue "Échéances" — vue d'ensemble des documents/visites à renouveler ─────
type NotificationTier = "day" | "week" | "month";

type NotificationRow = {
  employeeId: string;
  employeeName: string;
  type: string;
  date: string;
  time?: string | null;
  tier: NotificationTier;
};

/** month/week/day thresholds — an item only ever appears in its most urgent
 *  matching tier, never duplicated across tiers. */
function notificationTier(dateIso: string): NotificationTier | null {
  const days = daysUntil(dateIso);
  if (days <= 1) return "day";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return null;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Next occurrence (this year, or next year if already passed) of a
 *  recurring birth date — clamps Feb 29 to Feb 28 on non-leap years. */
function nextBirthdayIso(dobIso: string): string {
  const [, moStr, dStr] = dobIso.split("-");
  const mo = Number(moStr);
  const d = Number(dStr);
  const todayIso = today();
  const thisYear = Number(todayIso.split("-")[0]);
  function build(year: number): string {
    const day = mo === 2 && d === 29 && !isLeapYear(year) ? 28 : d;
    return `${year}-${moStr}-${String(day).padStart(2, "0")}`;
  }
  const candidate = build(thisYear);
  return candidate < todayIso ? build(thisYear + 1) : candidate;
}

/** Russian pluralization for "года/лет/год" — e.g. 21 год, 22 года, 25 лет. */
function ruYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "года";
  return "лет";
}

const NOTIFICATIONS_SEEN_STORAGE_KEY = "vladis_notifications_seen";

function notificationKey(r: NotificationRow): string {
  return `${r.employeeId}|${r.type}|${r.date}`;
}

/** Single source of truth for the notification list — called once from
 *  AdminPage (for the sidebar badge count) and handed down to
 *  NotificationsView as a prop, rather than fetched twice. */
async function fetchNotificationRows(
  supabase: ReturnType<typeof createClient>
): Promise<NotificationRow[]> {
  const [{ data: docs }, { data: visits }, { data: emps }] = await Promise.all([
    supabase
      .from("employee_documents")
      .select(
        "employee_id, valid_until, document_categories(label), employees(first_name, last_name, status)"
      )
      .not("valid_until", "is", null),
    supabase
      .from("medical_visits")
      .select(
        "employee_id, last_visit_date, next_visit_date, next_visit_time, employees(first_name, last_name, status)"
      ),
    supabase
      .from("employees")
      .select("id, first_name, last_name, status, date_of_birth")
      .not("date_of_birth", "is", null),
  ]);

  type DocRow = {
    employee_id: string;
    valid_until: string | null;
    document_categories: { label: string } | { label: string }[] | null;
    employees: { first_name: string; last_name: string; status: string } | null;
  };
  type VisitRow = {
    employee_id: string;
    last_visit_date: string | null;
    next_visit_date: string | null;
    next_visit_time: string | null;
    employees: { first_name: string; last_name: string; status: string } | null;
  };
  type BirthdayRow = {
    id: string;
    first_name: string;
    last_name: string;
    status: string;
    date_of_birth: string;
  };

  const rows: NotificationRow[] = [];

  ((docs as unknown as DocRow[]) ?? []).forEach((d) => {
    if (!d.employees || d.employees.status === "terminated" || !d.valid_until) return;
    const tier = notificationTier(d.valid_until);
    if (!tier) return;
    const cat = Array.isArray(d.document_categories) ? d.document_categories[0] : d.document_categories;
    rows.push({
      employeeId: d.employee_id,
      employeeName: employeeName(d.employees),
      type: cat?.label ?? "Document",
      date: d.valid_until,
      tier,
    });
  });

  ((visits as unknown as VisitRow[]) ?? []).forEach((v) => {
    if (!v.employees || v.employees.status === "terminated") return;

    if (v.next_visit_date) {
      const tier = notificationTier(v.next_visit_date);
      if (tier) {
        rows.push({
          employeeId: v.employee_id,
          employeeName: employeeName(v.employees),
          type: "Visite médicale",
          date: v.next_visit_date,
          time: v.next_visit_time,
          tier,
        });
      }
    }

    if (v.last_visit_date) {
      const legalDeadline = addDaysIsoLocal(v.last_visit_date, 3 * 365);
      const tier = notificationTier(legalDeadline);
      if (tier) {
        rows.push({
          employeeId: v.employee_id,
          employeeName: employeeName(v.employees),
          type: "Rappel légal — visite médicale (3 ans)",
          date: legalDeadline,
          tier,
        });
      }
    }
  });

  ((emps as unknown as BirthdayRow[]) ?? []).forEach((e) => {
    if (e.status === "terminated") return;
    const nextBday = nextBirthdayIso(e.date_of_birth);
    const tier = notificationTier(nextBday);
    if (!tier) return;
    const age = Number(nextBday.split("-")[0]) - Number(e.date_of_birth.split("-")[0]);
    rows.push({
      employeeId: e.id,
      employeeName: employeeName(e),
      type: `Anniversaire (${age} ans) / День рождения (${age} ${ruYears(age)})`,
      date: nextBday,
      tier,
    });
  });

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

const NOTIFICATION_TIER_LABELS: Record<NotificationTier, { fr: string; ru: string; barClass: string }> = {
  day: { fr: "Aujourd'hui / demain", ru: "Сегодня / завтра", barClass: "bg-error-500 text-white" },
  week: { fr: "Cette semaine", ru: "На этой неделе", barClass: "bg-warning-500 text-white" },
  month: { fr: "Ce mois-ci", ru: "В этом месяце", barClass: "bg-warning-200 text-warning-900" },
};

function NotificationsView({
  notifications,
  loading,
}: {
  notifications: NotificationRow[];
  loading: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter(
      (r) => r.employeeName.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)
    );
  }, [notifications, search]);

  const counts = useMemo(() => {
    const c: Record<NotificationTier, number> = { day: 0, week: 0, month: 0 };
    notifications.forEach((r) => c[r.tier]++);
    return c;
  }, [notifications]);

  return (
    <div>
      <div className="card mb-4">
        <div className="font-bold mb-1">
          <Bi
            fr="Notifications"
            ru="Уведомления"
            after={
              <InfoNote
                title="Notifications"
                text={
                  "Всё, что скоро понадобится сделать: документы, у которых истекает срок действия, ближайшие медосмотры, обязательный повторный медосмотр раз в 3 года (по закону) — и дни рождения сотрудников.\n\n" +
                  "Список разбит на три группы по срочности: «Сегодня/завтра», «На этой неделе», «В этом месяце». Каждая запись показывается только один раз — в самой срочной из подходящих групп.\n\n" +
                  "Красная точка рядом с «Notifications» в меню слева означает, что появилось что-то новое, чего вы ещё не открывали. Она пропадает, как только вы зайдёте на эту страницу."
                }
              />
            }
          />
        </div>
        <p className="text-xs text-stone-400 mb-3">
          Documents, visites médicales, rappels légaux (3 ans) et anniversaires arrivant dans le
          mois, tous employés confondus.{" "}
          <span className="opacity-70">
            / Документы, медосмотры, юридические напоминания (3 года) и дни рождения сотрудников,
            наступающие в течение месяца.
          </span>
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="badge badge-error gap-2 px-3 py-1.5">
            <span className="text-xl font-extrabold leading-none">{counts.day}</span>
            <Bi fr="aujourd'hui/demain" ru="сегодня/завтра" />
          </span>
          <span className="badge badge-warning gap-2 px-3 py-1.5">
            <span className="text-xl font-extrabold leading-none">{counts.week}</span>
            <Bi fr="cette semaine" ru="на неделе" />
          </span>
          <span className="badge badge-neutral gap-2 px-3 py-1.5">
            <span className="text-xl font-extrabold leading-none">{counts.month}</span>
            <Bi fr="ce mois-ci" ru="в этом месяце" />
          </span>
        </div>
        <label className="block text-xs font-bold text-stone-400">
          <Bi fr="Recherche" ru="Поиск" />
        </label>
        <input
          className="input mt-1 max-w-sm"
          placeholder="Nom, prénom, type de document…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card">
          <SkeletonRows rows={6} cols={3} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Rien à signaler"
            titleRu="Нечего отметить"
            description="Aucun document, visite médicale ou rappel légal à échéance dans le mois qui vient."
          />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-400">
                <th className="pb-2 pr-4"><Bi fr="Employé" ru="Сотрудник" /></th>
                <th className="pb-2 pr-4"><Bi fr="Type" ru="Тип" /></th>
                <th className="pb-2 pr-4"><Bi fr="Échéance" ru="Срок" /></th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const urgency = dateUrgency(r.date);
                const showTierHeader = i === 0 || filtered[i - 1].tier !== r.tier;
                const tierInfo = NOTIFICATION_TIER_LABELS[r.tier];
                return (
                  <Fragment key={`${r.employeeId}-${r.type}-${r.date}-${i}`}>
                    {showTierHeader && (
                      <tr>
                        <td colSpan={4} className={i === 0 ? "p-0" : "pt-4 p-0"}>
                          <p className={`px-4 py-2 text-xs font-bold uppercase tracking-wide ${tierInfo.barClass}`}>
                            <Bi fr={tierInfo.fr} ru={tierInfo.ru} />
                          </p>
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-stone-100">
                      <td className="py-2 pr-4 font-semibold">{r.employeeName}</td>
                      <td className="py-2 pr-4 text-stone-500">{r.type}</td>
                      <td className="py-2 pr-4">
                        {formatDateShortDMY(r.date)}
                        {r.time && <span className="ml-1 text-stone-400">{r.time.slice(0, 5)}</span>}
                      </td>
                      <td className="py-2">
                        {urgency ? (
                          <span className={`badge badge-${urgency.tone}`}>{urgency.label}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
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

function addDaysIsoLocal(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

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
          <div className="font-bold flex items-center">
            Registre unique du personnel ({filtered.length}/{counts.total})
            <InfoNote
              title="Registre du personnel"
              text={
                "Официальный реестр личного состава (Registre Unique du Personnel), обязательный по французскому законодательству: даты приёма и увольнения, гражданство и другие сведения по каждому сотруднику.\n\n" +
                "Даты приёма из этого реестра используются также в разделе «Dossier salarié» — например, чтобы подставить дату приёма на работу в название загруженного трудового договора."
              }
            />
          </div>
          <button className="btn btn-dark text-sm px-3 py-2" onClick={exportExcel}>
            <Bi fr="Exporter Excel" ru="Экспорт в Excel" />
          </button>
        </div>
        <p className="text-xs text-stone-400 mb-4">
          Copie fidèle du registre — un enregistrement par embauche (un salarié réembauché
          apparaît plusieurs fois). Les lignes surlignées correspondent aux salariés de
          nationalité étrangère.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "all" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"
            }`}
          >
            {counts.total} au total <span className="opacity-70">/ всего</span>
          </button>
          <button
            onClick={() => setStatusFilter("present")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "present" ? "bg-success-600 text-white" : "bg-success-50 text-success-700"
            }`}
          >
            {counts.present} sans date de sortie{" "}
            <span className="opacity-70">/ без даты увольнения</span>
          </button>
          <button
            onClick={() => setStatusFilter("sorti")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              statusFilter === "sorti" ? "bg-error-600 text-white" : "bg-error-50 text-error-700"
            }`}
          >
            {counts.sorti} sortis <span className="opacity-70">/ уволены</span>
          </button>
          <button
            onClick={() => setForeignersOnly((v) => !v)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              foreignersOnly ? "bg-warning-600 text-white" : "bg-warning-50 text-warning-700"
            }`}
          >
            {counts.foreigners} étrangers <span className="opacity-70">/ иностранцы</span>
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
            <option value="all">Toutes nationalités / Все национальности</option>
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
            <option value="all">Tous sexes / Все полы</option>
            <option value="M">Homme / Мужской</option>
            <option value="F">Femme / Женский</option>
          </select>
        </div>
      </div>

      <Modal open={!!(editingId && editForm)} onClose={cancelEdit} title="Modifier l'enregistrement" maxWidth="max-w-3xl">
        {editForm && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {REGISTRE_FIELD_LABELS.map((f) => (
                <label key={f.key} className="text-xs font-bold text-stone-500">
                  <Bi fr={f.label} ru={f.labelRu} />
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
                {saving ? "Enregistrement…" : <Bi fr="Enregistrer" ru="Сохранить" />}
              </button>
              <button className="btn btn-secondary text-sm px-3 py-2" onClick={cancelEdit}>
                <Bi fr="Annuler" ru="Отмена" />
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
              <tr className="text-left text-stone-400 whitespace-nowrap">
                {REGISTRE_FIELD_LABELS.map((f) => (
                  <th key={f.key} className="py-2 pr-4">
                    <Bi fr={f.label} ru={f.labelRu} />
                  </th>
                ))}
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const foreign = isForeignNationality(r.nationalite);
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-stone-100 ${foreign ? "bg-warning-50" : ""}`}
                  >
                    <td className="py-2 pr-4 text-stone-400 whitespace-nowrap">{r.numero ?? "—"}</td>
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
                      <RowAction
                        icon={Pencil}
                        title="Modifier"
                        titleRu="Изменить"
                        onClick={() => startEdit(r)}
                      />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="py-6 text-center text-stone-400">
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
};
const BUREAU_ROLE_LABELS_RU: Record<string, string> = {
  boss: "Босс",
  rh: "Кадры",
  assistant: "Ассистент руководителя",
  coach: "Коуч",
  production: "Производство",
  planning: "Планирование",
  comptable: "Бухгалтер",
  marketing: "Маркетинг",
  control: "Контроль качества",
  formation_officer: "Обучение",
  depot: "Склад",
  hotel: "Отель",
};
const BUREAU_ROLE_ORDER = Object.keys(BUREAU_ROLE_LABELS);

/** "Equipe 3" -> "Бригада 3" — team names are DB data (not a lookup table),
 *  so the Russian label is derived rather than mapped. */
function teamLabelRu(name: string): string {
  return name.replace(/^équipe/i, "Бригада").replace(/^equipe/i, "Бригада");
}

type OrgEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  category: "bureau" | "chantier";
  bureau_role: string | null;
  team_id: string | null;
  teams: { name: string } | null;
  org_sort_order: number | null;
  badge_emoji: string | null;
};

type OrgTeam = { id: string; name: string; chef_employee_id: string | null };

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
            "id, first_name, last_name, category, bureau_role, team_id, teams!employees_team_id_fkey(name), org_sort_order, badge_emoji"
          )
          .eq("status", "active")
          .order("last_name"),
        supabase.from("teams").select("id, name, chef_employee_id").eq("active", true).order("name"),
      ]);
      setEmployees((emp as unknown as OrgEmployee[]) ?? []);
      setTeams((tm as OrgTeam[]) ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const bureauEmployees = useMemo(() => employees.filter((e) => e.category === "bureau"), [employees]);
  // Manual drag order first (nulls last), alphabetical as the fallback/tiebreak.
  const chantierEmployees = useMemo(
    () =>
      [...employees]
        .filter((e) => e.category === "chantier")
        .sort(
          (a, b) =>
            (a.org_sort_order ?? Number.MAX_SAFE_INTEGER) - (b.org_sort_order ?? Number.MAX_SAFE_INTEGER) ||
            a.last_name.localeCompare(b.last_name)
        ),
    [employees]
  );

  async function handleToggleChef(teamId: string, employeeId: string) {
    const current = teams.find((t) => t.id === teamId)?.chef_employee_id ?? null;
    const nextChef = current === employeeId ? null : employeeId;
    setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, chef_employee_id: nextChef } : t)));
    const { error } = await supabase.from("teams").update({ chef_employee_id: nextChef }).eq("id", teamId);
    if (error) {
      toast.error("Erreur : " + error.message);
      setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, chef_employee_id: current } : t)));
    }
  }

  async function handleReorderTeam(newOrder: OrgEmployee[]) {
    const ids = new Set(newOrder.map((e) => e.id));
    setEmployees((prev) => {
      const rank = new Map(newOrder.map((e, i) => [e.id, i]));
      return prev.map((e) => (ids.has(e.id) ? { ...e, org_sort_order: rank.get(e.id)! } : e));
    });
    const results = await Promise.all(
      newOrder.map((e, i) => supabase.from("employees").update({ org_sort_order: i }).eq("id", e.id))
    );
    if (results.some((r) => r.error)) {
      toast.error("Erreur lors de l'enregistrement de l'ordre.");
    }
  }

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
  const teamChefMap = useMemo(
    () => new Map(teams.map((t) => [t.id, t.chef_employee_id])),
    [teams]
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
      <div className="card mb-4">
        <div className="font-bold flex items-center">
          Bureau <span className="ml-1 font-normal text-stone-400">Бюро</span>
          <InfoNote
            title="Organigramme"
            text={
              "Оргструктура компании: офис (Bureau) сверху, бригады на стройке (Chantier) ниже.\n\n" +
              "Перетаскивайте карточки, чтобы менять порядок внутри колонки. В бригадах можно нажать на карточку сотрудника, чтобы назначить его бригадиром (корона) или снять — то же самое можно сделать в разделе «Employés», это один и тот же параметр."
            }
          />
        </div>
        <p className="text-xs text-stone-400 mb-3">
          Glissez une personne pour la réordonner dans sa colonne.{" "}
          <span className="opacity-70">/ Перетащите, чтобы изменить порядок в колонке.</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {bureauColumns.map((c) => (
            <OrgColumn
              key={c.key}
              header={c.label}
              headerRu={BUREAU_ROLE_LABELS_RU[c.key]}
              employees={bureauGrid.byColumn.get(c.key) ?? []}
            />
          ))}
        </div>
      </div>

      <div className="card mb-4">
        <p className="font-bold">
          Chantier — par équipe <span className="ml-1 font-normal text-stone-400">Стройка — по бригадам</span>
        </p>
        <p className="text-xs text-stone-400 mb-3">
          Glissez-déposez une personne pour changer son ordre dans son équipe. Cliquez sur une
          personne pour la désigner (ou non) comme chef d&apos;équipe.{" "}
          <span className="opacity-70">
            / Перетащите, чтобы изменить порядок в бригаде. Нажмите на человека, чтобы назначить
            (или снять) бригадиром.
          </span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {teamColumns.map((c) => (
            <OrgColumn
              key={c.key}
              header={c.label}
              headerRu={teamLabelRu(c.label)}
              employees={teamGrid.byColumn.get(c.key) ?? []}
              chefId={teamChefMap.get(c.key)}
              onReorder={handleReorderTeam}
              onToggleChef={(employeeId) => handleToggleChef(c.key, employeeId)}
            />
          ))}
        </div>
      </div>

      {(unassignedBureau.length > 0 || unassignedChantier.length > 0) && (
        <div className="card">
          <p className="font-bold mb-3 text-error-600">
            Sans rôle ni équipe <span className="font-normal text-error-400">Без роли и бригады</span> (
            {unassignedBureau.length + unassignedChantier.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[...unassignedBureau, ...unassignedChantier].map((e) => (
              <OrgTile
                key={e.id}
                label={e.badge_emoji ? `${employeeName(e)} ${e.badge_emoji}` : employeeName(e)}
                tone="member"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Colored square tile — hierarchy tier is conveyed by color rather than by
 *  which column it's in: boss (brand blue) > bureau staff (amber) > team lead
 *  (green) > regular team member (plain), matching how the org chart is read
 *  at a glance. */
function OrgTile({ label, tone }: { label: string; tone: "boss" | "bureau" | "lead" | "member" }) {
  const toneClasses: Record<typeof tone, string> = {
    boss: "bg-primary-600 border-primary-600 text-white",
    bureau: "bg-warning-50 border-warning-200 text-warning-800",
    lead: "bg-success-50 border-success-200 text-success-800",
    member: "bg-white border-stone-200 text-stone-800",
  };
  return (
    <div
      className={`flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold leading-tight ${toneClasses[tone]}`}
    >
      {tone === "lead" && <Crown size={11} className="shrink-0 fill-current" />}
      <span className="truncate">{label}</span>
    </div>
  );
}

function OrgColumn({
  header,
  headerRu,
  employees,
  chefId,
  onReorder,
  onToggleChef,
}: {
  header: string;
  headerRu?: string;
  employees: OrgEmployee[];
  chefId?: string | null;
  /** When provided, tiles become drag-and-drop reorderable within this column. */
  onReorder?: (newOrder: OrgEmployee[]) => void;
  /** When provided, clicking a tile toggles that person as the team's chef. */
  onToggleChef?: (employeeId: string) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex || !onReorder) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...employees];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    onReorder(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="truncate rounded-lg bg-stone-800 px-2.5 py-2 text-center text-[0.7rem] font-bold uppercase tracking-wide text-white">
        {header}
        {headerRu && <span className="block truncate text-[0.6rem] font-medium normal-case opacity-60">{headerRu}</span>}
      </div>
      {employees.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-200 px-2.5 py-2 text-center text-xs text-stone-300">
          —
        </div>
      ) : (
        employees.map((e, i) => (
          <div
            key={e.id}
            draggable={!!onReorder}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(ev) => {
              if (!onReorder) return;
              ev.preventDefault();
              setOverIndex(i);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDrop={() => handleDrop(i)}
            onClick={() => onToggleChef?.(e.id)}
            title={onToggleChef ? "Cliquer pour désigner/retirer comme chef d'équipe / Нажмите, чтобы назначить/снять бригадира" : undefined}
            className={`${onReorder ? "cursor-grab active:cursor-grabbing" : ""} ${
              overIndex === i && dragIndex !== i ? "opacity-60" : ""
            } ${onToggleChef ? "cursor-pointer" : ""}`}
          >
            <OrgTile
              label={e.badge_emoji ? `${employeeName(e)} ${e.badge_emoji}` : employeeName(e)}
              tone={
                e.bureau_role === "boss"
                  ? "boss"
                  : chefId && e.id === chefId
                  ? "lead"
                  : e.category === "bureau"
                  ? "bureau"
                  : "member"
              }
            />
          </div>
        ))
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
      <p className="card text-center text-stone-400">
        Aucune séance programmée. Exécutez la migration des cours de français pour importer le
        calendrier.{" "}
        <span className="opacity-70">
          / Нет запланированных занятий. Выполните миграцию курсов французского, чтобы
          импортировать календарь.
        </span>
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 font-bold">
        <Bi
          fr="Cours de français"
          ru="Курсы французского"
          after={
            <InfoNote
              title="Cours de français"
              text={
                "Учёт занятий по французскому языку: список сессий (дат занятий) и посещаемость.\n\n" +
                "Выберите дату занятия сверху, затем отметьте по каждому сотруднику: отсутствовал ли он, сделал ли домашнее задание, прошёл ли контрольную."
              }
            />
          }
        />
      </div>
      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="font-bold text-sm">
          <Bi fr="Séance" ru="Занятие" />
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
        {saving && (
          <span className="text-xs text-stone-400">
            Enregistrement… <span className="opacity-70">/ Сохранение…</span>
          </span>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-stone-400">
              <th className="py-2 pr-4"><Bi fr="Élève" ru="Ученик" /></th>
              <th className="py-2 pr-4">Absent (Н)</th>
              <th className="py-2 pr-4">Devoir fait (ДЗ)</th>
              <th className="py-2 pr-4">Contrôle (К)</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const a = attendanceByEmployee.get(s.employee_id);
              return (
                <tr key={s.employee_id} className="border-t border-stone-100">
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
type PaieEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  category: "chantier" | "bureau";
  bureau_role: string | null;
  team_id: string | null;
  teams: { name: string; chef_employee_id: string | null } | null;
  contract_type: string | null;
};

/** FOP (auto-entrepreneur) contractors like Kirichok Kateryna aren't payroll
 *  employees — their compensation is worked out entirely outside this system,
 *  so their row is excluded from every formula/bulk-apply/import/sync path. */
function PaieEmployeeName({ employee: e }: { employee: PaieEmployee }) {
  const isChef = !!e.team_id && e.teams?.chef_employee_id === e.id;
  return (
    <span className="inline-flex items-center gap-1.5">
      {isChef && <Crown size={12} className="shrink-0 fill-current text-success-600" />}
      {employeeName(e)}
    </span>
  );
}

function isFopContractor(e: PaieEmployee): boolean {
  return e.contract_type === "FOP";
}

const PAIE_CONTROL_FORMATION_ROLES = new Set(["control", "formation_officer"]);
const PAIE_TEAM_COLOR_PALETTE = [
  "bg-blue-50",
  "bg-amber-50",
  "bg-purple-50",
  "bg-rose-50",
  "bg-cyan-50",
  "bg-orange-50",
  "bg-lime-50",
  "bg-fuchsia-50",
  "bg-teal-50",
  "bg-indigo-50",
];

type PaieGroupedRow = { employee: PaieEmployee; groupKey: string; groupLabel: string; colorClass: string };

/** Bureau first, then Contrôle/Formation staff, then chantier teams in numeric
 *  order — mirrors the reference org sheet's layout so RH can scan the same
 *  way they're used to, with a colored band per team. */
function groupPaieEmployees(employees: PaieEmployee[]): PaieGroupedRow[] {
  const bureauCore = employees.filter(
    (e) => e.category === "bureau" && !PAIE_CONTROL_FORMATION_ROLES.has(e.bureau_role ?? "")
  );
  const controlFormation = employees.filter(
    (e) => e.category === "bureau" && PAIE_CONTROL_FORMATION_ROLES.has(e.bureau_role ?? "")
  );
  const chantier = employees.filter((e) => e.category === "chantier");
  const other = employees.filter((e) => e.category !== "bureau" && e.category !== "chantier");

  bureauCore.sort((a, b) => {
    const ai = BUREAU_ROLE_ORDER.indexOf(a.bureau_role ?? "");
    const bi = BUREAU_ROLE_ORDER.indexOf(b.bureau_role ?? "");
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return employeeName(a).localeCompare(employeeName(b));
  });
  controlFormation.sort((a, b) => employeeName(a).localeCompare(employeeName(b)));

  const byTeam = new Map<string, PaieEmployee[]>();
  const noTeam: PaieEmployee[] = [];
  chantier.forEach((e) => {
    const teamName = e.teams?.name;
    if (!e.team_id || !teamName) {
      noTeam.push(e);
      return;
    }
    if (!byTeam.has(teamName)) byTeam.set(teamName, []);
    byTeam.get(teamName)!.push(e);
  });
  const teamNames = Array.from(byTeam.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const rows: PaieGroupedRow[] = [];
  bureauCore.forEach((e) => rows.push({ employee: e, groupKey: "bureau", groupLabel: "Bureau", colorClass: "bg-stone-50" }));
  controlFormation.forEach((e) =>
    rows.push({ employee: e, groupKey: "control", groupLabel: "Contrôle & Formation", colorClass: "bg-emerald-50" })
  );
  teamNames.forEach((name, i) => {
    const members = byTeam.get(name)!.sort((a, b) => employeeName(a).localeCompare(employeeName(b)));
    const colorClass = PAIE_TEAM_COLOR_PALETTE[i % PAIE_TEAM_COLOR_PALETTE.length];
    members.forEach((e) => rows.push({ employee: e, groupKey: `team:${name}`, groupLabel: name, colorClass }));
  });
  noTeam.forEach((e) => rows.push({ employee: e, groupKey: "unassigned", groupLabel: "Sans équipe", colorClass: "bg-white" }));
  other.forEach((e) => rows.push({ employee: e, groupKey: "other", groupLabel: "Autre", colorClass: "bg-white" }));

  return rows;
}

/** Uppercased, accent-stripped, sorted word list — lets "CIOBANU Valeriu" match
 *  "Valeriu CIOBANU" or extra whitespace/case differences from a pasted sheet. */
function normalizePaieNameWords(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function samePaieNameWords(a: string[], b: string[]): boolean {
  return a.length > 0 && a.length === b.length && a.every((w, i) => w === b[i]);
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function permuteWords(words: string[]): string[][] {
  if (words.length <= 1) return [words];
  const result: string[][] = [];
  words.forEach((w, i) => {
    const rest = [...words.slice(0, i), ...words.slice(i + 1)];
    permuteWords(rest).forEach((p) => result.push([w, ...p]));
  });
  return result;
}

// Known name variants that a Levenshtein distance can't safely bridge —
// nicknames ("SASHA" for "ALEXANDR") aren't a spelling typo of each other,
// and some transliteration pairs (LEVCHUK/LEVCIUC) differ by more letters
// than is safe to allow generically. Extend as new confirmed pairs come up;
// each entry is treated as an exact match (distance 0) in both directions.
const PAIE_NAME_ALIASES: Record<string, string[]> = {
  SASHA: ["ALEXANDR"],
  ALEXANDR: ["SASHA"],
  VASYL: ["VASILII"],
  VASILII: ["VASYL"],
  LEVCHUK: ["LEVCIUC"],
  LEVCIUC: ["LEVCHUK"],
};

function wordDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (PAIE_NAME_ALIASES[a]?.includes(b)) return 0;
  return levenshteinDistance(a, b);
}

// Same word count required; tries every word-to-word pairing (cheap for the
// 1-3 word names here) and keeps the cheapest, since a spelling difference
// can shift which word sorts first (normalizePaieNameWords sorts A-Z).
function wordListDistance(a: string[], b: string[]): number {
  if (a.length !== b.length) return Infinity;
  let best = Infinity;
  for (const perm of permuteWords(b)) {
    let total = 0;
    for (let i = 0; i < a.length; i++) total += wordDistance(a[i], perm[i]);
    if (total < best) best = total;
  }
  return best;
}

// Falls back to approximate matching when no employee has the exact same
// word set — covers transliteration/spelling variants between the pasted
// sheet and the database (e.g. "KOBZAR" vs "COBZARI", "ILIN" vs "ILIIN").
// Only ever returns a match that's unambiguous (no other employee comes
// nearly as close), since this assigns real payroll amounts.
function fuzzyMatchPayableEmployee(nameWords: string[], payableEmployees: PaieEmployee[]): PaieEmployee | null {
  const sameCount = payableEmployees
    .map((e) => ({ employee: e, distance: wordListDistance(nameWords, normalizePaieNameWords(employeeName(e))) }))
    .filter((c) => c.distance <= nameWords.length * 2)
    .sort((a, b) => a.distance - b.distance);
  if (sameCount.length > 0 && (sameCount.length === 1 || sameCount[0].distance < sameCount[1].distance)) {
    return sameCount[0].employee;
  }

  // A single pasted word (e.g. just a first or last name) matching exactly
  // one word of exactly one employee's full name — still requires the hit
  // to be unique across the whole payable list.
  if (nameWords.length === 1) {
    const word = nameWords[0];
    const hits = payableEmployees.filter((e) =>
      normalizePaieNameWords(employeeName(e)).some((w) => wordDistance(w, word) <= 1)
    );
    if (hits.length === 1) return hits[0];
  }

  return null;
}

// Exact match first, approximate match as a fallback flagged for review.
function matchPayableEmployee(
  nameWords: string[],
  payableEmployees: PaieEmployee[]
): { employee: PaieEmployee; fuzzy: boolean } | null {
  const exact = payableEmployees.find((e) => samePaieNameWords(normalizePaieNameWords(employeeName(e)), nameWords));
  if (exact) return { employee: exact, fuzzy: false };
  const fuzzy = fuzzyMatchPayableEmployee(nameWords, payableEmployees);
  return fuzzy ? { employee: fuzzy, fuzzy: true } : null;
}

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
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<{
    matchedCount: number;
    fuzzyMatches: { pasted: string; employee: string }[];
    unmatched: string[];
  } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setHolidayBonusSelection("");
      const monthIso = `${year}-${String(month).padStart(2, "0")}-01`;

      const [{ data: emp }, { data: paramRow }] = await Promise.all([
        supabase
          .from("employees")
          .select(
            "id, first_name, last_name, category, bureau_role, team_id, teams!employees_team_id_fkey(name, chef_employee_id), contract_type"
          )
          // A employee terminated mid-month (end_date within this month or
          // later) still worked part of it and needs a partial-month line —
          // excluding them outright as soon as status flips to "terminated"
          // would drop their last paycheck entirely.
          .or(`status.eq.active,and(status.eq.terminated,end_date.gte.${monthIso})`)
          .order("last_name"),
        supabase.from("payroll_parameters").select("*").limit(1).maybeSingle(),
      ]);
      setEmployees((emp as unknown as PaieEmployee[]) ?? []);
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
          if (isFopContractor(e as unknown as PaieEmployee)) {
            map[e.id] = { ...EMPTY_PAIE_LINE };
            return;
          }
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
          map[e.id] = {
            ...EMPTY_PAIE_LINE,
            joursRepas: isFopContractor(e as unknown as PaieEmployee) ? "" : defaultJoursRepas,
          };
        });
        setInputs(map);
      }

      setLoading(false);
    }
    load();
  }, [supabase, year, month]);

  const workingDaysInMonth = useMemo(() => countWorkingDaysInMonth(year, month), [year, month]);
  const monthHolidays = useMemo(() => frenchHolidaysInMonth(year, month), [year, month]);
  const groupedRows = useMemo(() => groupPaieEmployees(employees), [employees]);
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
        if (isFopContractor(e)) return;
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
        if (isFopContractor(e)) return;
        next[e.id] = { ...(next[e.id] ?? EMPTY_PAIE_LINE), majJoursFeries: holidayBonusSelection };
      });
      return next;
    });
  }

  // Accepts three paste shapes: "Nom [tab] Montant" pairs (matched by name,
  // robust to word order/case/accents); a bare list of amounts (applied in
  // the table's current visual/grouped order); or — since Nom and Montant
  // often aren't adjacent columns in the source sheet and can't be copied
  // together as one range — a Nom column pasted in full followed immediately
  // by a Montant column pasted for that same row range. In that last shape,
  // filler rows (team-header rows, vacant slots) land at the same line
  // position in both halves, so pairing by index and skipping any pair
  // where either side is blank/unusable discards them automatically.
  function parseImportAmount(s: string): number {
    const cleaned = s.trim().replace(/[^\d.,-]/g, "").replace(",", ".");
    return cleaned === "" ? NaN : parseFloat(cleaned);
  }

  function applyImport() {
    const rawLines = importText.split("\n").map((l) => l.replace(/\r$/, ""));
    while (rawLines.length && !rawLines[0].trim()) rawLines.shift();
    while (rawLines.length && !rawLines[rawLines.length - 1].trim()) rawLines.pop();
    if (rawLines.length === 0) return;

    const lines = rawLines.map((l) => l.trim()).filter(Boolean);

    const parseLine = (line: string): string[] => {
      let parts = line
        .split("\t")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 2) {
        parts = line
          .split(/\s{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);
      }
      return parts;
    };

    const allSingleColumn = lines.every((l) => parseLine(l).length < 2);
    const updates: Record<string, string> = {};
    const matchedNames: string[] = [];
    const unmatchedLines: string[] = [];
    const fuzzyMatches: { pasted: string; employee: string }[] = [];
    // FOP contractors have no formula row to paste an amount into.
    const payableRows = groupedRows.filter((row) => !isFopContractor(row.employee));
    const payableEmployees = employees.filter((e) => !isFopContractor(e));

    // Detected independently of allSingleColumn/parseLine (which split on 2+
    // consecutive spaces) — a name with an accidental double space, like
    // "VORONINSKYI  YEVHENII", would otherwise be misread as its own
    // "Nom [tab] Montant" pair and break detection for the whole paste.
    const looksTwoBlock = (() => {
      if (rawLines.length < 4 || rawLines.length % 2 !== 0) return false;
      const half = rawLines.length / 2;
      const firstNonBlank = rawLines.slice(0, half).filter((l) => l.trim());
      const secondNonBlank = rawLines.slice(half).filter((l) => l.trim());
      if (firstNonBlank.length === 0 || secondNonBlank.length === 0) return false;
      const firstAllNonNumeric = firstNonBlank.every((l) => isNaN(parseImportAmount(l)));
      const secondNumericRatio =
        secondNonBlank.filter((l) => !isNaN(parseImportAmount(l))).length / secondNonBlank.length;
      return firstAllNonNumeric && secondNumericRatio >= 0.5;
    })();

    if (looksTwoBlock) {
      const half = rawLines.length / 2;
      const namesHalf = rawLines.slice(0, half);
      const amountsHalf = rawLines.slice(half);
      for (let i = 0; i < half; i++) {
        const name = namesHalf[i].trim();
        const amount = parseImportAmount(amountsHalf[i]);
        if (!name || isNaN(amount)) continue;
        const nameWords = normalizePaieNameWords(name);
        const match = matchPayableEmployee(nameWords, payableEmployees);
        if (!match) {
          unmatchedLines.push(`${name} — ${amountsHalf[i].trim()}`);
          continue;
        }
        updates[match.employee.id] = String(amount);
        matchedNames.push(employeeName(match.employee));
        if (match.fuzzy) fuzzyMatches.push({ pasted: name, employee: employeeName(match.employee) });
      }
    } else if (allSingleColumn) {
      lines.forEach((line, i) => {
        const amount = parseImportAmount(line);
        const row = payableRows[i];
        if (!row || isNaN(amount)) {
          unmatchedLines.push(line);
          return;
        }
        updates[row.employee.id] = String(amount);
        matchedNames.push(employeeName(row.employee));
      });
    } else {
      lines.forEach((line) => {
        const parts = parseLine(line);
        if (parts.length < 2) {
          unmatchedLines.push(line);
          return;
        }
        const amount = parseImportAmount(parts[parts.length - 1]);
        const nameWords = normalizePaieNameWords(parts[0]);
        const match = matchPayableEmployee(nameWords, payableEmployees);
        if (!match || isNaN(amount)) {
          unmatchedLines.push(line);
          return;
        }
        updates[match.employee.id] = String(amount);
        matchedNames.push(employeeName(match.employee));
        if (match.fuzzy) fuzzyMatches.push({ pasted: parts[0], employee: employeeName(match.employee) });
      });
    }

    if (Object.keys(updates).length > 0) {
      setInputs((prev) => {
        const next = { ...prev };
        Object.entries(updates).forEach(([id, amount]) => {
          next[id] = { ...(next[id] ?? EMPTY_PAIE_LINE), netSouhaite: amount };
        });
        return next;
      });
    }

    setImportResult({ matchedCount: matchedNames.length, fuzzyMatches, unmatched: unmatchedLines });
    const fuzzyNote = fuzzyMatches.length > 0 ? ` (dont ${fuzzyMatches.length} par correspondance approximative — à vérifier)` : "";
    if (unmatchedLines.length === 0) {
      toast.success(`${matchedNames.length} montant(s) appliqué(s)${fuzzyNote}.`);
    } else {
      toast.warning(
        `${matchedNames.length} appliqué(s)${fuzzyNote}, ${unmatchedLines.length} ligne(s) non reconnue(s).`
      );
    }
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
      if (isFopContractor(e)) {
        map[e.id] = { hs25Heures: 0, hs50Heures: 0, primeExceptionnelle: 0 };
        return;
      }
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
    return employees
      .filter((e) => !isFopContractor(e))
      .reduce(
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
    const exportRows: Record<string, string | number>[] = groupedRows.map((row, i) => {
      const e = row.employee;
      if (isFopContractor(e)) {
        return {
          "#": i + 1,
          Groupe: row.groupLabel,
          "Nom Prénom": employeeName(e),
          "Net souhaité €": "FOP — rémunération hors paie, calcul non applicable",
          "Maj. jours fériés €": "",
          "Jours repas": "",
          "HS+25% h": "",
          "HS+50% h": "",
          "Prime except. €": "",
        };
      }
      const line = inputs[e.id] ?? EMPTY_PAIE_LINE;
      const c = computed[e.id];
      return {
        "#": i + 1,
        Groupe: row.groupLabel,
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
      Groupe: "",
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
      if (isFopContractor(e)) continue;
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
      <div className="mb-3 font-bold">
        <Bi
          fr="Paie"
          ru="Зарплата"
          after={
            <InfoNote
              title="Paie"
              text={
                "Расчёт зарплаты: вы вводите желаемую сумму на руки (net souhaité), учитываете переработки, праздничные дни, тикеты-ресторан — система считает переработки +25%/+50% и итоговую сумму по каждому сотруднику.\n\n" +
                "Здесь НЕ создаётся официальный расчётный листок (bulletin de paie) — это только подготовка цифр, которые потом передаются бухгалтеру.\n\n" +
                "Сотрудники сгруппированы по офису/контролю-обучению/бригадам. У сотрудников-подрядчиков (FOP) эти формулы не применяются."
              }
            />
          }
        />
      </div>
      <div className="card mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="font-bold text-sm">
            <Bi fr="Mois" ru="Месяц" />
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
            <Bi fr="Année" ru="Год" />
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
            <Bi fr="Paramètres de calcul" ru="Параметры расчёта" />
          </button>
          <button
            className="btn btn-secondary text-sm"
            onClick={() => {
              setImportText("");
              setImportResult(null);
              setShowImportModal(true);
            }}
          >
            <Upload size={15} /> <Bi fr="Importer" ru="Импорт" />
          </button>
          <button className="btn btn-secondary text-sm" onClick={exportExcel}>
            <FileSpreadsheet size={15} /> <Bi fr="Exporter Excel" ru="Экспорт в Excel" />
          </button>
          <button className="btn btn-primary text-sm" disabled={saving} onClick={save}>
            {saving ? "Enregistrement…" : <Bi fr="Enregistrer" ru="Сохранить" />}
          </button>
          <button className="btn btn-dark text-sm" onClick={() => setShowSyncModal(true)}>
            <RefreshCw size={15} /> <Bi fr="Appliquer au pointage" ru="Применить к табелю" />
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-bold">{workingDaysInMonth} jours ouvrés</span>
            <span className="text-stone-400"> ce mois-ci — utilisé comme valeur par défaut pour « Jours repas ».</span>
          </p>
          <button className="btn btn-secondary text-xs px-3 py-1.5" onClick={applyWorkingDaysToAll}>
            <Bi fr="Appliquer à tous" ru="Применить ко всем" />
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
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-3">
              <p className="text-sm text-stone-500">
                Majoration jour férié suggérée :{" "}
                <span className="font-bold text-stone-700">
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
                <Bi fr="Appliquer à tous" ru="Применить ко всем" />
              </button>
            </div>
          </>
        )}
      </div>

      {showParams && (
        <div className="card mb-4">
          <p className="font-bold mb-3">
            <Bi fr="Paramètres de calcul" ru="Параметры расчёта" />
          </p>
          <p className="text-xs text-stone-400 mb-3">
            Ces valeurs viennent du classeur Excel de référence. À ajuster seulement si le taux
            horaire, le SMIC ou les cotisations changent — le calcul ci-dessous s&apos;appuiera
            immédiatement sur les nouvelles valeurs.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <p>
              <Bi fr="Taux horaire base" ru="Базовая ставка/ч" />{" "}
              <span className="block font-bold">{params.tauxHoraireBase} €/h</span>
            </p>
            <p>
              <Bi fr="Heures normales/mois" ru="Обычные часы/мес" />{" "}
              <span className="block font-bold">{params.heuresNormalesMois} h</span>
            </p>
            <p>
              <Bi fr="Majoration HS+25%" ru="Надбавка СЧ+25%" />{" "}
              <span className="block font-bold">{params.majorationHs25 * 100}%</span>
            </p>
            <p>
              <Bi fr="Majoration HS+50%" ru="Надбавка СЧ+50%" />{" "}
              <span className="block font-bold">{params.majorationHs50 * 100}%</span>
            </p>
            <p>
              <Bi fr="Majoration jour férié" ru="Надбавка за праздник" />{" "}
              <span className="block font-bold">{params.majorationJourFerie * 100}%</span>
            </p>
            <p>
              <Bi fr="Tarif repas/jour" ru="Тариф питания/день" />{" "}
              <span className="block font-bold">{params.tarifRepasJour} €</span>
            </p>
            <p>
              <Bi fr="Max jours repas/mois" ru="Макс. дней питания/мес" />{" "}
              <span className="block font-bold">{params.maxJoursRepas}</span>
            </p>
            <p>
              <Bi fr="Max HS+25% h/mois" ru="Макс. ч СЧ+25%/мес" />{" "}
              <span className="block font-bold">{params.maxHs25Heures} h</span>
            </p>
            <p>
              <Bi fr="Max HS+50% h/mois" ru="Макс. ч СЧ+50%/мес" />{" "}
              <span className="block font-bold">{params.maxHs50Heures} h</span>
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
              <tr className="text-left text-stone-400 whitespace-nowrap">
                <th className="py-2 pr-4"><Bi fr="Nom Prénom" ru="Фамилия Имя" /></th>
                <th className="py-2 pr-4 text-warning-700"><Bi fr="Net souhaité €" ru="Желаемый нетто €" /></th>
                <th className="py-2 pr-4 text-warning-700"><Bi fr="Maj. jours fériés €" ru="Надбавка праздники €" /></th>
                <th className="py-2 pr-4 text-warning-700"><Bi fr="Jours repas" ru="Дней питания" /></th>
                <th className="py-2 pr-4 text-primary-600"><Bi fr="HS+25% h" ru="СЧ+25% ч" /></th>
                <th className="py-2 pr-4 text-primary-600"><Bi fr="HS+50% h" ru="СЧ+50% ч" /></th>
                <th className="py-2 pr-4 text-primary-600"><Bi fr="Prime except. €" ru="Премия €" /></th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((row, idx) => {
                const e = row.employee;
                const line = inputs[e.id] ?? EMPTY_PAIE_LINE;
                const c = computed[e.id];
                const showGroupHeader = idx === 0 || groupedRows[idx - 1].groupKey !== row.groupKey;
                return (
                  <Fragment key={e.id}>
                    {showGroupHeader && (
                      <tr>
                        <td
                          colSpan={7}
                          className="pt-4 pb-1 text-xs font-bold uppercase tracking-wide text-stone-400"
                        >
                          {row.groupLabel}
                        </td>
                      </tr>
                    )}
                    {isFopContractor(e) ? (
                      <tr className={`border-t border-stone-100 ${row.colorClass}`}>
                        <td className="py-2 pr-4 font-semibold whitespace-nowrap">
                          <PaieEmployeeName employee={e} />
                        </td>
                        <td colSpan={6} className="py-2 pr-4 italic text-stone-500">
                          FOP — rémunération hors paie, calcul non applicable
                        </td>
                      </tr>
                    ) : (
                    <tr className={`border-t border-stone-100 ${row.colorClass}`}>
                    <td className="py-2 pr-4 font-semibold whitespace-nowrap">
                      <PaieEmployeeName employee={e} />
                    </td>
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
                    )}
                  </Fragment>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-stone-400">
                    Aucun résultat. <span className="opacity-70">/ Нет результатов.</span>
                  </td>
                </tr>
              )}
            </tbody>
            {employees.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-stone-200 font-bold">
                  <td className="py-2 pr-4">
                    TOTAL <span className="font-normal opacity-60">/ ИТОГО</span>
                  </td>
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
        <p className="text-sm text-stone-600 mb-4">
          Pour chaque employé, les heures HS+25% et HS+50% calculées ce mois-ci seront réparties
          également entre les journées déjà pointées, en <strong>remplaçant</strong> les heures
          supplémentaires que les chefs d&apos;équipe ont saisies. Cette action est irréversible.
        </p>
        <div className="flex gap-3">
          <button className="btn btn-red text-sm px-3 py-2" disabled={syncing} onClick={syncHoursToPointage}>
            {syncing ? "Application…" : <Bi fr="Confirmer et appliquer" ru="Подтвердить и применить" />}
          </button>
          <button className="btn btn-secondary text-sm px-3 py-2" onClick={() => setShowSyncModal(false)}>
            <Bi fr="Annuler" ru="Отмена" />
          </button>
        </div>
      </Modal>

      <Modal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Importer depuis Excel"
        maxWidth="max-w-lg"
      >
        <p className="text-sm text-stone-500 mb-2">
          Collez une colonne <strong>Nom Prénom</strong> et une colonne <strong>Montant</strong> copiées
          ensemble depuis Excel/Numbers (une ligne par salarié) ; ou, si les deux colonnes ne sont pas
          côte à côte dans le fichier source, collez toute la colonne <strong>Nom Prénom</strong> puis,
          juste après, toute la colonne <strong>Montant</strong> pour la même plage de lignes ; ou juste
          une colonne de montants, dans l&apos;ordre du tableau ci-dessous. Les montants sont appliqués au
          champ « Net souhaité ».
        </p>
        <textarea
          className="input font-mono text-xs"
          rows={10}
          placeholder={"CIOBANU Valeriu\t2530\nSTAFII Boris\t2945.50"}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        {importResult && (
          <div className="mt-3 text-sm">
            <p className="text-success-600 font-semibold">{importResult.matchedCount} montant(s) appliqué(s).</p>
            {importResult.fuzzyMatches.length > 0 && (
              <div className="mt-1 text-warning-700">
                <p className="font-semibold">Correspondance approximative — à vérifier :</p>
                <ul className="list-disc pl-5">
                  {importResult.fuzzyMatches.map((m, i) => (
                    <li key={i}>
                      « {m.pasted} » → {m.employee}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {importResult.unmatched.length > 0 && (
              <div className="mt-1 text-error-600">
                <p className="font-semibold">Non reconnu(s) :</p>
                <ul className="list-disc pl-5">
                  {importResult.unmatched.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3 mt-4">
          <button className="btn btn-primary text-sm px-3 py-2" disabled={!importText.trim()} onClick={applyImport}>
            <Bi fr="Appliquer" ru="Применить" />
          </button>
          <button className="btn btn-secondary text-sm px-3 py-2" onClick={() => setShowImportModal(false)}>
            <Bi fr="Fermer" ru="Закрыть" />
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
  uploaded_by_email: string | null;
};
type DocumentActionLogRow = {
  id: string;
  category_code: string;
  file_name: string;
  action: "upload" | "delete";
  actor_email: string | null;
  created_at: string;
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
  next_visit_time: string | null;
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

/** Short, consistent display name for an uploaded document — "Catégorie - DD-MM-YYYY.ext" —
 *  instead of whatever the source file happened to be called (IMG_2026.pdf, scan1.pdf...). */
function standardFileName(categoryLabel: string, originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot) : "";
  const dateStr = today().split("-").reverse().join("-");
  return `${categoryLabel} - ${dateStr}${ext}`;
}

/** Contracts carry more useful info than an upload date — whether it's signed,
 *  and the actual hire date from the Registre entry — "Contrat de travail -
 *  Signé - DD-MM-YYYY.ext". Other categories (RIB, etc.) don't need this. */
function standardContractFileName(originalName: string, signed: boolean, hireDateIso: string | null): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot) : "";
  const signedLabel = signed ? "Signé" : "Non signé";
  const dateStr = hireDateIso ? hireDateIso.split("-").reverse().join("-") : "date-inconnue";
  return `Contrat de travail - ${signedLabel} - ${dateStr}${ext}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** "Ajouté le DD/MM/YYYY · uploader@mail" — shown under each document's name. */
function docMetaLine(doc: EmployeeDocumentRow): string {
  const date = new Date(doc.created_at).toLocaleDateString("fr-FR");
  return doc.uploaded_by_email ? `Ajouté le ${date} · ${doc.uploaded_by_email}` : `Ajouté le ${date}`;
}

function DossierPeriodCategory({
  category,
  icon: Icon,
  entries,
  documents,
  uploadingKey,
  onUpload,
  onPreview,
  onDownload,
  onDelete,
}: {
  category: DocumentCategory;
  icon: LucideIcon;
  entries: RegistreEntry[];
  documents: EmployeeDocumentRow[];
  uploadingKey: string | null;
  onUpload: (categoryCode: string, file: File, registreEntryId: string) => void;
  onPreview: (doc: EmployeeDocumentRow) => void;
  onDownload: (doc: EmployeeDocumentRow) => void;
  onDelete: (doc: EmployeeDocumentRow) => void;
}) {
  return (
    <div className="rounded-xl border border-stone-100 p-3">
      <p className="text-sm font-bold flex items-center gap-2 mb-2">
        <Icon size={15} className="text-stone-400" />
        {category.label}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-stone-400">
          {category.code === "rupture" ? (
            <>
              Aucune sortie enregistrée. <span className="opacity-70">/ Нет зарегистрированного увольнения.</span>
            </>
          ) : (
            <>
              Aucune période d&apos;embauche trouvée dans le Registre du personnel.{" "}
              <span className="opacity-70">/ Период трудоустройства не найден в реестре персонала.</span>
            </>
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const docs = documents.filter(
              (d) => d.category_code === category.code && d.registre_entry_id === entry.id
            );
            const key = `${category.code}:${entry.id}`;
            return (
              <div key={entry.id} className="rounded-lg bg-stone-50 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-stone-500">
                    {entry.date_entree ? formatDateShortDMY(entry.date_entree) : "—"} →{" "}
                    {entry.date_sortie ? formatDateShortDMY(entry.date_sortie) : "en cours"}
                  </p>
                  <label className="btn btn-secondary text-xs px-2.5 py-1 cursor-pointer">
                    {uploadingKey === key ? (
                      "Envoi…"
                    ) : (
                      <>
                        <Upload size={12} /> <Bi fr="Ajouter" ru="Добавить" />
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
                  <p className="text-xs text-stone-400">
                    Aucun document. <span className="opacity-70">/ Нет документов.</span>
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {docs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-white"
                      >
                        <span className="min-w-0 truncate">
                          <span className="truncate">{doc.file_name}</span>
                          <span className="block text-[10px] font-medium text-stone-400 truncate">
                            {docMetaLine(doc)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-stone-400">{formatFileSize(doc.file_size)}</span>
                          <button
                            onClick={() => onPreview(doc)}
                            title="Visualiser / Просмотреть"
                            className="text-stone-400 hover:text-primary-600"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => onDownload(doc)}
                            title="Télécharger / Скачать"
                            className="text-stone-400 hover:text-primary-600"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => onDelete(doc)}
                            title="Supprimer / Удалить"
                            className="text-stone-400 hover:text-error-600"
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
  const [actionLog, setActionLog] = useState<DocumentActionLogRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [expiryModal, setExpiryModal] = useState<{ categoryCode: string; file: File } | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [contractModal, setContractModal] = useState<{
    file: File;
    registreEntryId: string;
    hireDate: string | null;
  } | null>(null);
  const [contractSigned, setContractSigned] = useState(true);

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
        "id, employee_id, category_code, file_name, storage_path, file_size, created_at, valid_until, registre_entry_id, uploaded_by_email"
      )
      .eq("employee_id", selectedEmployeeId)
      .order("created_at", { ascending: false });
    setDocuments((data as EmployeeDocumentRow[]) ?? []);
  }

  async function reloadActionLog() {
    if (!selectedEmployeeId) return;
    const { data } = await supabase
      .from("document_action_log")
      .select("id, category_code, file_name, action, actor_email, created_at")
      .eq("employee_id", selectedEmployeeId)
      .order("created_at", { ascending: false })
      .limit(100);
    setActionLog((data as DocumentActionLogRow[]) ?? []);
  }

  useEffect(() => {
    async function loadDetail() {
      if (!selectedEmployeeId) {
        setDocuments([]);
        setConfidential(null);
        setMedicalVisits([]);
        setRegistreEntries([]);
        setActionLog([]);
        return;
      }
      setLoadingDetail(true);
      const [{ data: docs }, { data: conf }, { data: visits }, { data: registre }, { data: log }] = await Promise.all([
        supabase
          .from("employee_documents")
          .select(
            "id, employee_id, category_code, file_name, storage_path, file_size, created_at, valid_until, registre_entry_id, uploaded_by_email"
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
          .select("id, last_visit_date, next_visit_date, next_visit_time, visit_subtype")
          .eq("employee_id", selectedEmployeeId)
          .order("next_visit_date", { ascending: false }),
        supabase
          .from("registre_unique_personnel")
          .select("id, date_entree, date_sortie, nationalite")
          .eq("employee_id", selectedEmployeeId)
          .order("date_entree", { ascending: false }),
        supabase
          .from("document_action_log")
          .select("id, category_code, file_name, action, actor_email, created_at")
          .eq("employee_id", selectedEmployeeId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      setDocuments((docs as EmployeeDocumentRow[]) ?? []);
      setConfidential((conf as DossierConfidential) ?? null);
      setMedicalVisits((visits as DossierMedicalVisit[]) ?? []);
      setRegistreEntries((registre as RegistreEntry[]) ?? []);
      setActionLog((log as DocumentActionLogRow[]) ?? []);
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
    opts?: { validUntil?: string; registreEntryId?: string; fileNameOverride?: string }
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
    const categoryLabel = categories.find((c) => c.code === categoryCode)?.label ?? categoryCode;
    const { error: insertError } = await supabase.from("employee_documents").insert({
      employee_id: selectedEmployeeId,
      category_code: categoryCode,
      file_name: opts?.fileNameOverride ?? standardFileName(categoryLabel, file.name),
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
    await Promise.all([reloadDocuments(), reloadOverdueCounts(), reloadActionLog()]);
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

  async function previewFile(doc: EmployeeDocumentRow) {
    const { data, error } = await supabase.storage
      .from(DOSSIER_BUCKET)
      .createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      toast.error("Erreur d'aperçu : " + (error?.message ?? "fichier introuvable"));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
    await Promise.all([reloadDocuments(), reloadOverdueCounts(), reloadActionLog()]);
    toast.success("Document supprimé");
  }

  return (
    <div className="flex gap-4 items-start">
      <div className="card w-72 shrink-0">
        <div className="font-bold mb-3">
          <Bi
            fr="Employés"
            ru="Сотрудники"
            after={
              <InfoNote
                title="Dossier salarié"
                text={
                  "Личное дело сотрудника — все загруженные документы по категориям (контракт, RIB, медицина, вид на жительство и т.д.).\n\n" +
                  "Кнопка с глазом — посмотреть файл, не скачивая его. Кнопка «Historique» у карточки сотрудника показывает, кто и когда загрузил или удалил документ.\n\n" +
                  "Для некоторых категорий (например «Habilitation», «Titre de séjour») система попросит указать дату истечения — эти документы сами появятся в разделе «Notifications», когда срок будет подходить. Для «Contrat de travail» вместо этого спрашивается, подписан ли договор — дата приёма подставляется автоматически из Registre du personnel."
                }
              />
            }
          />
        </div>
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
          <option value="active">Actifs / Активны</option>
          <option value="on_leave">En congé / В отпуске</option>
          <option value="terminated">Sortis / Уволены</option>
          <option value="all">Tous / Все</option>
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
                  onClick={() => {
                    setSelectedEmployeeId(e.id);
                    setShowHistory(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 text-left rounded-lg px-2 py-1.5 text-sm font-semibold ${
                    selectedEmployeeId === e.id
                      ? "bg-primary-50 text-primary-700"
                      : "text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  <span className="truncate">{employeeName(e)}</span>
                  {overdueCount > 0 && (
                    <span
                      className="badge badge-error shrink-0"
                      title="Documents en retard / Просроченные документы"
                    >
                      {overdueCount}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && <EmptyState title="Aucun employé" titleRu="Нет сотрудников" />}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {!selectedEmployee ? (
          <div className="card">
            <EmptyState
              title="Sélectionnez un employé"
              titleRu="Выберите сотрудника"
              description="Choisissez un employé dans la liste pour voir et gérer son dossier."
            />
          </div>
        ) : (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold">Dossier — {employeeName(selectedEmployee)}</p>
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="btn btn-secondary text-xs px-3 py-1.5"
              >
                <History size={13} />
                <Bi fr="Historique" ru="История" />
              </button>
            </div>
            {showHistory && (
              <div className="mb-4 rounded-xl border border-stone-100 p-3 max-h-64 overflow-y-auto">
                {actionLog.length === 0 ? (
                  <p className="text-xs text-stone-400">
                    Aucune action enregistrée. <span className="opacity-70">/ Нет зарегистрированных действий.</span>
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {actionLog.map((entry) => (
                      <li key={entry.id} className="text-xs text-stone-500 flex items-center gap-2 flex-wrap">
                        <span
                          className={`badge ${entry.action === "upload" ? "badge-success" : "badge-error"}`}
                        >
                          {entry.action === "upload" ? (
                            <Bi fr="Ajouté" ru="Добавлен" />
                          ) : (
                            <Bi fr="Supprimé" ru="Удалён" />
                          )}
                        </span>
                        <span className="font-semibold">{entry.file_name}</span>
                        <span className="opacity-70">
                          {new Date(entry.created_at).toLocaleString("fr-FR")}
                          {entry.actor_email ? ` · ${entry.actor_email}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
                        onUpload={(code, file, registreEntryId) => {
                          if (code === "contrat") {
                            const entry = entries.find((en) => en.id === registreEntryId);
                            setContractModal({ file, registreEntryId, hireDate: entry?.date_entree ?? null });
                            setContractSigned(true);
                          } else {
                            uploadFile(code, file, { registreEntryId });
                          }
                        }}
                        onPreview={previewFile}
                        onDownload={downloadFile}
                        onDelete={deleteFile}
                      />
                    );
                  }

                  const docs = documents.filter((d) => d.category_code === cat.code);
                  const key = `${cat.code}:`;

                  return (
                    <div key={cat.code} className="rounded-xl border border-stone-100 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold flex items-center gap-2">
                          <Icon size={15} className="text-stone-400" />
                          {cat.label}
                          {cat.sensitive && (
                            <span className="badge badge-warning">
                              <Bi fr="confidentiel" ru="конфиденциально" />
                            </span>
                          )}
                        </p>
                        <label className="btn btn-secondary text-xs px-3 py-1.5 cursor-pointer">
                          {uploadingKey === key ? (
                            "Envoi…"
                          ) : (
                            <>
                              <Upload size={13} /> <Bi fr="Ajouter" ru="Добавить" />
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
                        <p className="text-xs text-stone-500 mb-2">
                          IBAN enregistré <span className="opacity-70">/ Зарегистрированный IBAN</span> :{" "}
                          <span className="font-semibold">{confidential.rib}</span>
                        </p>
                      )}
                      {cat.code === "assurance_maladie" && confidential?.status_ameli && (
                        <p className="text-xs text-stone-500 mb-2">
                          Statut Ameli <span className="opacity-70">/ Статус Ameli</span> :{" "}
                          <span className="font-semibold">{confidential.status_ameli}</span>
                        </p>
                      )}
                      {cat.code === "carte_vitale" && confidential?.carte_vitale && (
                        <p className="text-xs text-stone-500 mb-2">
                          N° Carte Vitale <span className="opacity-70">/ № карты Vitale</span> :{" "}
                          <span className="font-semibold">{confidential.carte_vitale}</span>
                        </p>
                      )}
                      {cat.code === "titre_visa" &&
                        (confidential?.residence_permit_type || confidential?.residence_permit_number) && (
                          <p className="text-xs text-stone-500 mb-2">
                            {confidential.residence_permit_type ?? "Titre"}
                            {confidential.residence_permit_number ? ` — n° ${confidential.residence_permit_number}` : ""}
                          </p>
                        )}
                      {cat.code === "medical_prevaly" &&
                        (medicalVisits.length === 0 ? (
                          <p className="text-xs text-stone-400 mb-2">
                            Aucune visite enregistrée dans le suivi médical.{" "}
                            <span className="opacity-70">/ Нет визитов в медицинском учёте.</span>
                          </p>
                        ) : (
                          <div className="mb-2 space-y-1">
                            {medicalVisits.map((v) => {
                              const urgency = dateUrgency(v.next_visit_date);
                              return (
                                <p key={v.id} className="text-xs text-stone-500 flex items-center gap-2 flex-wrap">
                                  <span>
                                    {v.visit_subtype ?? "Visite"} — dernière : {v.last_visit_date ?? "—"} · prochaine :{" "}
                                    {v.next_visit_date ?? "—"}
                                    {v.next_visit_date && v.next_visit_time && ` ${v.next_visit_time.slice(0, 5)}`}
                                  </span>
                                  {urgency && <span className={`badge badge-${urgency.tone}`}>{urgency.label}</span>}
                                </p>
                              );
                            })}
                          </div>
                        ))}

                      {docs.length === 0 ? (
                        <p className="text-xs text-stone-400">
                          Aucun document. <span className="opacity-70">/ Нет документов.</span>
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {docs.map((doc) => {
                            const urgency = dateUrgency(doc.valid_until);
                            return (
                              <li
                                key={doc.id}
                                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-50"
                              >
                                <span className="min-w-0 truncate">
                                  <span className="flex items-center gap-2 flex-wrap">
                                    {doc.file_name}
                                    {doc.valid_until && (
                                      <span className="text-xs text-stone-400">expire le {doc.valid_until}</span>
                                    )}
                                    {urgency && <span className={`badge badge-${urgency.tone}`}>{urgency.label}</span>}
                                  </span>
                                  <span className="block text-[10px] font-medium text-stone-400 truncate">
                                    {docMetaLine(doc)}
                                  </span>
                                </span>
                                <span className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-stone-400">{formatFileSize(doc.file_size)}</span>
                                  <button
                                    onClick={() => previewFile(doc)}
                                    title="Visualiser / Просмотреть"
                                    className="text-stone-400 hover:text-primary-600"
                                  >
                                    <Eye size={15} />
                                  </button>
                                  <button
                                    onClick={() => downloadFile(doc)}
                                    title="Télécharger / Скачать"
                                    className="text-stone-400 hover:text-primary-600"
                                  >
                                    <Download size={15} />
                                  </button>
                                  <button
                                    onClick={() => deleteFile(doc)}
                                    title="Supprimer / Удалить"
                                    className="text-stone-400 hover:text-error-600"
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
            <p className="text-sm text-stone-500 mb-3">
              Fichier <span className="opacity-70">/ Файл</span> :{" "}
              <span className="font-semibold">{expiryModal.file.name}</span>
            </p>
            <label className="text-xs font-bold text-stone-500">
              <Bi fr="Date d'expiration" ru="Дата истечения" />
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
                <Bi fr="Ajouter" ru="Добавить" />
              </button>
              <button className="btn btn-secondary text-sm px-3 py-2" onClick={() => setExpiryModal(null)}>
                <Bi fr="Annuler" ru="Отмена" />
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!contractModal}
        onClose={() => setContractModal(null)}
        title="Contrat de travail"
        maxWidth="max-w-sm"
      >
        {contractModal && (
          <>
            <p className="text-sm text-stone-500 mb-3">
              Fichier <span className="opacity-70">/ Файл</span> :{" "}
              <span className="font-semibold">{contractModal.file.name}</span>
            </p>
            <p className="text-xs font-bold text-stone-500 mb-1">
              <Bi fr="Ce contrat est-il signé ?" ru="Договор подписан?" />
            </p>
            <div className="flex gap-2">
              <button
                className={`btn text-sm px-3 py-2 ${contractSigned ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setContractSigned(true)}
              >
                <Bi fr="Signé" ru="Подписан" />
              </button>
              <button
                className={`btn text-sm px-3 py-2 ${!contractSigned ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setContractSigned(false)}
              >
                <Bi fr="Non signé" ru="Не подписан" />
              </button>
            </div>
            <p className="text-xs text-stone-400 mt-3">
              Date d&apos;embauche <span className="opacity-70">/ Дата приёма</span> :{" "}
              <span className="font-semibold text-stone-600">
                {contractModal.hireDate ? formatDateShortDMY(contractModal.hireDate) : "—"}
              </span>
            </p>
            <div className="flex gap-3 mt-4">
              <button
                className="btn btn-green text-sm px-3 py-2"
                onClick={async () => {
                  const fileName = standardContractFileName(
                    contractModal.file.name,
                    contractSigned,
                    contractModal.hireDate
                  );
                  await uploadFile("contrat", contractModal.file, {
                    registreEntryId: contractModal.registreEntryId,
                    fileNameOverride: fileName,
                  });
                  setContractModal(null);
                }}
              >
                <Bi fr="Ajouter" ru="Добавить" />
              </button>
              <button className="btn btn-secondary text-sm px-3 py-2" onClick={() => setContractModal(null)}>
                <Bi fr="Annuler" ru="Отмена" />
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
