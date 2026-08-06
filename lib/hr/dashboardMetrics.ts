/**
 * Pure HR dashboard calculations — tenure, age, turnover, tenure
 * distribution, hires/departures trend, trial period. Kept separate from
 * app/admin/page.tsx so a new group or a new turnover period is a data or
 * argument change here, not a rewrite of the dashboard view. Mirrors the
 * style of lib/rupture/compute.ts: plain exported types + pure functions,
 * no classes, no barrel file.
 */

export type EmployeeStatus = "active" | "on_leave" | "terminated" | "unclear";

export type DashEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  category: "chantier" | "bureau";
  contract_type: string | null;
  status: EmployeeStatus;
  hire_date: string | null;
  end_date: string | null;
  date_of_birth: string | null;
  teams:
    | { name: string; chef_employee_id: string | null }
    | { name: string; chef_employee_id: string | null }[]
    | null;
};

export function dashTeamOf(e: DashEmployee) {
  return Array.isArray(e.teams) ? e.teams[0] ?? null : e.teams;
}

export function dashIsChef(e: DashEmployee): boolean {
  const team = dashTeamOf(e);
  return Boolean(team && team.chef_employee_id === e.id);
}

export function dashIsFop(e: DashEmployee): boolean {
  return e.contract_type === "FOP";
}

/** Whole completed months between two ISO dates — the unit every duration on the HR dashboard is built from. */
export function monthsBetweenIso(startIso: string, endIso: string): number {
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function addMonthsIso(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().split("T")[0];
}

export function formatYearsMonths(totalMonths: number | null): string {
  if (totalMonths === null) return "—";
  const y = Math.floor(totalMonths / 12);
  const m = Math.round(totalMonths % 12);
  return `${y}a ${m}m`;
}

export function dashAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Reconstructs headcount at any past date directly from hire_date/end_date — no snapshot table needed or available. */
export function dashHeadcountAt(emps: DashEmployee[], dateIso: string): number {
  return emps.filter((e) => e.hire_date && e.hire_date <= dateIso && (!e.end_date || e.end_date > dateIso)).length;
}

export type HrGroupKey = "all" | "monteur" | "chef" | "chantier" | "bureau" | "fop";

export type HrGroupDef = {
  key: HrGroupKey;
  label: string;
  labelRu: string;
  predicate: (e: DashEmployee) => boolean;
};

/**
 * Groups as data, not branching code — adding a new group later (e.g. a new
 * role) is one entry here, not a page-wide change. "chef" tenure is measured
 * as the person's total time at the company, not time-since-promoted: there's
 * no history of who was chef when (teams.chef_employee_id changes aren't
 * audited anywhere), so that's the only version of this stat that's actually
 * reconstructable from the data.
 */
export const HR_GROUPS: HrGroupDef[] = [
  { key: "all", label: "Tous", labelRu: "Все", predicate: (e) => !dashIsFop(e) },
  {
    key: "monteur",
    label: "Monteurs",
    labelRu: "Монтажники",
    predicate: (e) => !dashIsFop(e) && e.category === "chantier" && !dashIsChef(e),
  },
  {
    key: "chef",
    label: "Chefs d'équipe",
    labelRu: "Бригадиры",
    predicate: (e) => !dashIsFop(e) && e.category === "chantier" && dashIsChef(e),
  },
  {
    key: "chantier",
    label: "Chantier (Monteurs + Chefs)",
    labelRu: "Монтажники + Бригадиры",
    predicate: (e) => !dashIsFop(e) && e.category === "chantier",
  },
  { key: "bureau", label: "Bureau", labelRu: "Офис", predicate: (e) => !dashIsFop(e) && e.category === "bureau" },
  { key: "fop", label: "FOP (sous-traitants)", labelRu: "FOP (подрядчики)", predicate: dashIsFop },
];

export type TurnoverPeriod = "rolling12" | "calendarYear";

export type TurnoverResult = {
  hires: number;
  departures: number;
  rate: number | null;
};

/**
 * Turnover for one population over one period. Kept as its own function
 * (instead of inlined per-group) so a future quarter/year toggle in the UI is
 * a new call with a different `period`, not new logic — only "rolling12" is
 * wired into the dashboard today.
 */
export function computeTurnover(
  allInGroup: DashEmployee[],
  todayIso: string,
  period: TurnoverPeriod = "rolling12"
): TurnoverResult {
  const periodStartIso = period === "calendarYear" ? `${todayIso.slice(0, 4)}-01-01` : addMonthsIso(todayIso, -12);

  const headcountNow = dashHeadcountAt(allInGroup, todayIso);
  const headcountAtStart = dashHeadcountAt(allInGroup, periodStartIso);
  const avgHeadcount = (headcountNow + headcountAtStart) / 2;

  const departures = allInGroup.filter(
    (e) => e.status === "terminated" && e.end_date && e.end_date > periodStartIso && e.end_date <= todayIso
  ).length;
  const hires = allInGroup.filter((e) => e.hire_date && e.hire_date > periodStartIso && e.hire_date <= todayIso).length;

  return { hires, departures, rate: avgHeadcount > 0 ? (departures / avgHeadcount) * 100 : null };
}

export type DashGroupStats = {
  key: HrGroupKey;
  label: string;
  labelRu: string;
  count: number;
  avgTenureMonths: number | null;
  avgAgeMonths: number | null;
  hires12mo: number;
  departures12mo: number;
  turnoverRate: number | null;
};

/**
 * `allInGroup` must include terminated employees too — headcount
 * reconstruction and turnover need the full history; only the
 * ancienneté/âge averages are restricted to people currently on the books.
 */
export function computeGroupStats(group: HrGroupDef, allInGroup: DashEmployee[], todayIso: string): DashGroupStats {
  const current = allInGroup.filter((e) => e.status !== "terminated");
  const tenureMonths = current.filter((e) => e.hire_date).map((e) => monthsBetweenIso(e.hire_date!, todayIso));
  const ageMonths = current.filter((e) => e.date_of_birth).map((e) => monthsBetweenIso(e.date_of_birth!, todayIso));
  const turnover = computeTurnover(allInGroup, todayIso);

  return {
    key: group.key,
    label: group.label,
    labelRu: group.labelRu,
    count: current.length,
    avgTenureMonths: dashAverage(tenureMonths),
    avgAgeMonths: dashAverage(ageMonths),
    hires12mo: turnover.hires,
    departures12mo: turnover.departures,
    turnoverRate: turnover.rate,
  };
}

export type TenureBucket = { label: string; labelRu: string; min: number; max: number };

export const DASH_TENURE_BUCKETS: TenureBucket[] = [
  { label: "< 3 mois", labelRu: "< 3 мес", min: 0, max: 3 },
  { label: "3–6 mois", labelRu: "3–6 мес", min: 3, max: 6 },
  { label: "6–12 mois", labelRu: "6–12 мес", min: 6, max: 12 },
  { label: "1–2 ans", labelRu: "1–2 года", min: 12, max: 24 },
  { label: "2–5 ans", labelRu: "2–5 лет", min: 24, max: 60 },
  { label: "5 ans et +", labelRu: "5 лет и более", min: 60, max: Infinity },
];

export type TenureDistributionSlice = TenureBucket & { count: number; employees: DashEmployee[] };

export function computeTenureDistribution(
  employees: DashEmployee[],
  todayIso: string,
  buckets: TenureBucket[] = DASH_TENURE_BUCKETS
): TenureDistributionSlice[] {
  const current = employees.filter((e) => e.status !== "terminated" && e.hire_date);
  return buckets.map((b) => {
    const matching = current.filter((e) => {
      const m = monthsBetweenIso(e.hire_date!, todayIso);
      return m >= b.min && m < b.max;
    });
    return { ...b, count: matching.length, employees: matching };
  });
}

export type TrendMonth = { label: string; hires: DashEmployee[]; departures: DashEmployee[] };

/** `months` is a plain count going back from today; callers wanting "all time" compute an effective count from the data themselves (earliest hire/end date) and pass that in. */
export function computeHiresDeparturesTrend(employees: DashEmployee[], todayIso: string, months: number): TrendMonth[] {
  const trend: TrendMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthKey = addMonthsIso(todayIso, -i).slice(0, 7); // "YYYY-MM"
    trend.push({
      label: monthKey,
      hires: employees.filter((e) => e.hire_date?.slice(0, 7) === monthKey),
      departures: employees.filter((e) => e.status === "terminated" && e.end_date?.slice(0, 7) === monthKey),
    });
  }
  return trend;
}

export type DateRange = { startIso: string; endIso: string };

export function yearRange(year: number): DateRange {
  return { startIso: `${year}-01-01`, endIso: `${year}-12-31` };
}

export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): DateRange {
  const startMonth = (quarter - 1) * 3 + 1;
  const startIso = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const endIso = addDaysIso(addMonthsIso(startIso, 3), -1);
  return { startIso, endIso };
}

/** Same shape as computeGroupStats's turnover fields, for an arbitrary explicit range instead of a fixed rolling window. */
export function computeHiresDeparturesInRange(
  employees: DashEmployee[],
  range: DateRange
): { hires: DashEmployee[]; departures: DashEmployee[] } {
  return {
    hires: employees.filter((e) => e.hire_date && e.hire_date >= range.startIso && e.hire_date <= range.endIso),
    departures: employees.filter(
      (e) => e.status === "terminated" && e.end_date && e.end_date >= range.startIso && e.end_date <= range.endIso
    ),
  };
}

/** Month-by-month breakdown of an explicit range — the manual/year/quarter counterpart to computeHiresDeparturesTrend's fixed "N months back from today". */
export function computeHiresDeparturesTrendInRange(employees: DashEmployee[], range: DateRange): TrendMonth[] {
  const trend: TrendMonth[] = [];
  const endMonth = range.endIso.slice(0, 7);
  let cursor = range.startIso.slice(0, 7);
  let guard = 0;
  while (cursor <= endMonth && guard < 600) {
    trend.push({
      label: cursor,
      hires: employees.filter((e) => e.hire_date?.slice(0, 7) === cursor),
      departures: employees.filter((e) => e.status === "terminated" && e.end_date?.slice(0, 7) === cursor),
    });
    cursor = addMonthsIso(`${cursor}-01`, 1).slice(0, 7);
    guard += 1;
  }
  return trend;
}

export type TrialPeriodInfo = { endsAt: string };

/** 30 calendar days from hire_date. No new column — computed purely from a field that already exists. */
export function isInTrialPeriod(hireDate: string | null, todayIso: string): TrialPeriodInfo | null {
  if (!hireDate) return null;
  const endsAt = addDaysIso(hireDate, 30);
  return todayIso <= endsAt ? { endsAt } : null;
}
