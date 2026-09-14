import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { fetchPlanningJobs, PlanningJob } from "@/lib/planning/parsePlanning";
import { computeMedicalStatus, EmployeeMedicalStatus } from "@/lib/medical/status";

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type PlanningJobResolved = PlanningJob & {
  workerEmployeeId: string | null;
  workerMedicalStatus: EmployeeMedicalStatus | null;
};

export async function GET() {
  const check = await requireRole(["rh_admin", "rh"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;

  let jobs: PlanningJob[];
  try {
    jobs = await fetchPlanningJobs();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de chargement du planning" },
      { status: 500 }
    );
  }

  const [{ data: employees }, { data: visits }] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name, status").eq("status", "active"),
    supabase.from("medical_visits").select("employee_id, last_visit_date, next_visit_date"),
  ]);

  // Most names in the planning sheet are subcontractors/temp crew with no
  // record in our own employees table at all — that's expected, not a bug.
  // For the ones who ARE our employees, the cell text is often more than
  // just their name (e.g. "BORETS Yevhen Visite médical 13:00"), so matching
  // is done by whole-word containment rather than exact equality. A first
  // name shared by more than one active employee (e.g. two "Nicolai") is
  // left unmatched rather than guessed.
  const byFirstName = new Map<string, { id: string; first_name: string; last_name: string }[]>();
  for (const e of employees ?? []) {
    const fn = normalizeName(e.first_name);
    (byFirstName.get(fn) ?? byFirstName.set(fn, []).get(fn)!).push(e);
  }

  const visitByEmployeeId = new Map((visits ?? []).map((v) => [v.employee_id, v]));
  const todayIso = new Date().toISOString().split("T")[0];

  function resolveWorker(worker: string | null): { id: string | null; status: EmployeeMedicalStatus | null } {
    if (!worker) return { id: null, status: null };
    const words = new Set(normalizeName(worker).split(/[^a-z]+/).filter(Boolean));
    let match: { id: string; first_name: string; last_name: string } | null = null;
    for (const [firstName, candidates] of byFirstName) {
      if (!words.has(firstName)) continue;
      // Prefer a candidate whose last name also appears in the text; fall
      // back to the first-name-only match only when it's unambiguous.
      const withLastName = candidates.find((c) => words.has(normalizeName(c.last_name)));
      if (withLastName) {
        match = withLastName;
        break;
      }
      if (candidates.length === 1) match = candidates[0];
    }
    if (!match) return { id: null, status: null };
    const status = computeMedicalStatus(visitByEmployeeId.get(match.id) ?? null, todayIso);
    return { id: match.id, status };
  }

  const resolved: PlanningJobResolved[] = jobs.map((job) => {
    const { id, status } = resolveWorker(job.worker);
    return { ...job, workerEmployeeId: id, workerMedicalStatus: status };
  });

  return NextResponse.json({ jobs: resolved });
}
