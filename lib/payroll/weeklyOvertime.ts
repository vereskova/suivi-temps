/**
 * Weekly overtime recalculation, as explained by the payroll provider
 * (FITECO, M. Amaral, 04/11/2026) for the July 2026 labour-inspection file.
 *
 * Pure and read-only: it only reads the pointage rows it is given and never
 * writes anything back. It does not replace the Paie view or the monthly
 * payroll input - it is a control table that shows, per employee and per
 * calendar week (Mon-Sun), what the recorded hours would give if overtime
 * were counted weekly:
 *   - hours 36..43 of the week at +25 %, hours from the 44th at +50 %
 *     (thresholds are parameters);
 *   - monthly base pay is the mensualised 151.67 h, whatever the number of
 *     working days in the month;
 *   - a week straddling two months is paid in the month where it ENDS, so
 *     its overtime is "carried" to the next month and never counted twice.
 */

export const WEEKLY_OVERTIME_DEFAULTS = {
  /** Mensualised monthly base for a full-time (35 h/week) employee. */
  baseMonthlyHours: 151.67,
  /** Weekly hours above which the +25 % rate starts. */
  threshold25: 35,
  /** Weekly hours above which the +50 % rate starts. */
  threshold50: 43,
};

export type WeeklyOvertimeParams = typeof WEEKLY_OVERTIME_DEFAULTS;

export type PointageMinutesRow = {
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  total_minutes: number | null;
  is_absent: boolean | null;
};

export type WeekRange = {
  /** Monday, YYYY-MM-DD. */
  start: string;
  /** Sunday, YYYY-MM-DD. */
  end: string;
  /** True when the week ends inside the selected month, i.e. it is paid this month. */
  paidThisMonth: boolean;
};

export type EmployeeWeek = {
  /** Worked hours that week (recorded entries minus absences). */
  hours: number;
  /** Number of days with a worked entry that week. */
  days: number;
  hs25: number;
  hs50: number;
};

export type EmployeeWeeklyResult = {
  employeeId: string;
  weeks: EmployeeWeek[];
  /** Overtime to pay in the selected month (weeks that end in it). */
  hs25Month: number;
  hs50Month: number;
  /** Overtime of the week straddling into the next month (paid there). */
  hsCarried: number;
  /** Mensualised base + overtime payable this month. */
  theoreticalHours: number;
  /** Raw recorded hours inside the selected month only (what the app totals). */
  recordedHoursMonth: number;
};

const DAY_MS = 86_400_000;

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
function toIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Monday on or before `iso`. */
export function weekStartOf(iso: string): string {
  const d = toUtc(iso);
  const back = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  return toIso(new Date(d.getTime() - back * DAY_MS));
}

/** Weeks (Mon-Sun) touching the given month, in order. */
export function weeksOfMonth(year: number, month: number): WeekRange[] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = toIso(new Date(Date.UTC(year, month, 0)));
  const monthPrefix = first.slice(0, 7);
  const weeks: WeekRange[] = [];
  let cursor = weekStartOf(first);
  while (cursor <= last) {
    const end = toIso(new Date(toUtc(cursor).getTime() + 6 * DAY_MS));
    weeks.push({ start: cursor, end, paidThisMonth: end.slice(0, 7) === monthPrefix });
    cursor = toIso(new Date(toUtc(cursor).getTime() + 7 * DAY_MS));
  }
  return weeks;
}

/** Date range to load so that every week touching the month is complete. */
export function fetchRangeForMonth(year: number, month: number): { start: string; end: string } {
  const weeks = weeksOfMonth(year, month);
  return { start: weeks[0].start, end: weeks[weeks.length - 1].end };
}

export function weeklyOvertimeFor(
  rows: PointageMinutesRow[],
  year: number,
  month: number,
  params: WeeklyOvertimeParams = WEEKLY_OVERTIME_DEFAULTS
): EmployeeWeeklyResult[] {
  const weeks = weeksOfMonth(year, month);
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const byEmployee = new Map<string, PointageMinutesRow[]>();
  for (const r of rows) {
    const list = byEmployee.get(r.employee_id);
    if (list) list.push(r);
    else byEmployee.set(r.employee_id, [r]);
  }

  const results: EmployeeWeeklyResult[] = [];
  for (const [employeeId, empRows] of byEmployee) {
    const empWeeks: EmployeeWeek[] = weeks.map((w) => {
      let minutes = 0;
      let days = 0;
      for (const r of empRows) {
        if (r.work_date < w.start || r.work_date > w.end) continue;
        if (r.is_absent) continue;
        const m = r.total_minutes ?? 0;
        if (m > 0) {
          minutes += m;
          days += 1;
        }
      }
      const hours = minutes / 60;
      const hs25 = Math.max(0, Math.min(hours, params.threshold50) - params.threshold25);
      const hs50 = Math.max(0, hours - params.threshold50);
      return { hours, days, hs25, hs50 };
    });

    let hs25Month = 0;
    let hs50Month = 0;
    let hsCarried = 0;
    weeks.forEach((w, i) => {
      if (w.paidThisMonth) {
        hs25Month += empWeeks[i].hs25;
        hs50Month += empWeeks[i].hs50;
      } else {
        hsCarried += empWeeks[i].hs25 + empWeeks[i].hs50;
      }
    });

    const recordedMinutesMonth = empRows
      .filter((r) => r.work_date.startsWith(monthPrefix) && !r.is_absent)
      .reduce((s, r) => s + (r.total_minutes ?? 0), 0);

    results.push({
      employeeId,
      weeks: empWeeks,
      hs25Month,
      hs50Month,
      hsCarried,
      theoreticalHours: params.baseMonthlyHours + hs25Month + hs50Month,
      recordedHoursMonth: recordedMinutesMonth / 60,
    });
  }
  return results;
}
