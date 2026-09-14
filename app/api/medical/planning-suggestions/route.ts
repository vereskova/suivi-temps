import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { fetchPlanningJobs } from "@/lib/planning/parsePlanning";
import { computeMedicalStatus, EmployeeMedicalStatus } from "@/lib/medical/status";
import { LABEGE_COORDS, estimateDrivingMinutes, parseCoords } from "@/lib/planning/geo";

const MAX_MINUTES = 90;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** The sheet gives one row per week, so the same real multi-week assignment
 *  comes out as several back-to-back suggestions for the same person and
 *  site — merge those into a single row spanning the full range instead of
 *  repeating the same site line every week. */
function mergeConsecutiveWeeks(rows: MedicalPlanningSuggestion[]): MedicalPlanningSuggestion[] {
  const sorted = [...rows].sort(
    (a, b) =>
      a.employeeId.localeCompare(b.employeeId) ||
      a.team.localeCompare(b.team) ||
      (a.site ?? "").localeCompare(b.site ?? "") ||
      a.dateFrom.localeCompare(b.dateFrom)
  );
  const merged: MedicalPlanningSuggestion[] = [];
  for (const row of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.employeeId === row.employeeId &&
      last.team === row.team &&
      last.site === row.site &&
      addDaysIso(last.dateTo, 1) === row.dateFrom
    ) {
      last.dateTo = row.dateTo;
    } else {
      merged.push({ ...row });
    }
  }
  return merged;
}

export type MedicalPlanningSuggestion = {
  employeeName: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  status: EmployeeMedicalStatus;
  team: string;
  month: string;
  week: string;
  dateFrom: string;
  dateTo: string;
  site: string | null;
  estimatedMinutesFromLabege: number;
};

export async function GET() {
  const check = await requireRole(["rh_admin", "rh"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;

  let jobs;
  try {
    jobs = await fetchPlanningJobs();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de chargement du planning" },
      { status: 500 }
    );
  }

  const [{ data: employees }, { data: visits }, { data: teams }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, status, medical_visit_exempt, team_id")
      .eq("status", "active"),
    supabase.from("medical_visits").select("employee_id, last_visit_date, next_visit_date"),
    supabase.from("teams").select("id, name"),
  ]);

  // The planning sheet's "Equipe" band is the whole crew that day, but its
  // cells only ever name one or two people (whoever the sheet's author
  // happened to write in) — the rest of that team's real members are
  // implied, not listed. So matching is by team NUMBER (the sheet's "6" ↔
  // our own team named "Equipe 6"), not by the specific worker text.
  const teamNumberById = new Map<string, string>();
  for (const t of teams ?? []) {
    const match = t.name?.match(/^Equipe (\d+)$/);
    if (match) teamNumberById.set(t.id, match[1]);
  }

  const employeesByTeamNumber = new Map<string, typeof employees>();
  for (const e of employees ?? []) {
    if (!e.team_id) continue;
    const num = teamNumberById.get(e.team_id);
    if (!num) continue;
    (employeesByTeamNumber.get(num) ?? employeesByTeamNumber.set(num, []).get(num)!)!.push(e);
  }

  const visitByEmployeeId = new Map((visits ?? []).map((v) => [v.employee_id, v]));
  const todayIso = new Date().toISOString().split("T")[0];
  const twoMonthsOut = new Date();
  twoMonthsOut.setUTCMonth(twoMonthsOut.getUTCMonth() + 2);
  const horizonIso = twoMonthsOut.toISOString().split("T")[0];

  const suggestions: MedicalPlanningSuggestion[] = [];
  // Keyed by real ISO dates, not by week/month label: adjacent month sheets
  // both include a shared spillover week at their boundary (e.g. the same
  // real week appears as the tail of "Septembre" and the head of "Octobre"),
  // so the same job would otherwise be counted twice.
  const seen = new Set<string>();

  for (const job of jobs) {
    // Only a job whose week overlaps [today, today + 2 months] — a past
    // assignment can't be proposed as a slot, and anything further out isn't
    // actionable yet.
    if (!job.dateFromIso || !job.dateToIso) continue;
    if (job.dateToIso < todayIso || job.dateFromIso > horizonIso) continue;
    // Only a plain team number ("1".."10") maps to "Equipe N" — the "F"/"C"
    // bands and anything else are skipped rather than guessed.
    if (!/^\d+$/.test(job.team)) continue;

    const coords = parseCoords(job.coords);
    if (!coords) continue;
    const minutes = estimateDrivingMinutes(coords, LABEGE_COORDS);
    if (minutes > MAX_MINUTES) continue;

    const teamMembers = employeesByTeamNumber.get(job.team) ?? [];
    for (const member of teamMembers) {
      if (member.medical_visit_exempt) continue;
      const status = computeMedicalStatus(visitByEmployeeId.get(member.id) ?? null, todayIso);
      if (status !== "jamais_visite" && status !== "a_renouveler") continue;

      const key = `${member.id}|${job.dateFromIso}|${job.dateToIso}`;
      if (seen.has(key)) continue;
      seen.add(key);

      suggestions.push({
        employeeName: `${member.last_name} ${member.first_name}`,
        firstName: member.first_name,
        lastName: member.last_name,
        employeeId: member.id,
        status,
        team: job.team,
        month: job.month,
        week: job.week,
        dateFrom: job.dateFromIso,
        dateTo: job.dateToIso,
        site: job.site,
        estimatedMinutesFromLabege: minutes,
      });
    }
  }

  const merged = mergeConsecutiveWeeks(suggestions);
  merged.sort((a, b) => a.dateFrom.localeCompare(b.dateFrom) || a.estimatedMinutesFromLabege - b.estimatedMinutesFromLabege);

  return NextResponse.json({ suggestions: merged });
}
