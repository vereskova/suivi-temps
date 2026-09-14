import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { fetchPlanningJobs, PlanningJob } from "@/lib/planning/parsePlanning";
import { buildWorkerMatcher } from "@/lib/planning/matchWorker";
import { computeMedicalStatus, EmployeeMedicalStatus } from "@/lib/medical/status";

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
    supabase
      .from("employees")
      .select("id, first_name, last_name, status, medical_visit_exempt")
      .eq("status", "active"),
    supabase.from("medical_visits").select("employee_id, last_visit_date, next_visit_date"),
  ]);

  const matchWorker = buildWorkerMatcher(employees ?? []);
  const visitByEmployeeId = new Map((visits ?? []).map((v) => [v.employee_id, v]));
  const todayIso = new Date().toISOString().split("T")[0];

  const resolved: PlanningJobResolved[] = jobs.map((job) => {
    const match = matchWorker(job.worker);
    if (!match) return { ...job, workerEmployeeId: null, workerMedicalStatus: null };
    const status = match.medical_visit_exempt
      ? "exempte"
      : computeMedicalStatus(visitByEmployeeId.get(match.id) ?? null, todayIso);
    return { ...job, workerEmployeeId: match.id, workerMedicalStatus: status };
  });

  return NextResponse.json({ jobs: resolved });
}
