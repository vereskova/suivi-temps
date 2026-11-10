import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { serviceClient } from "@/lib/controle/server";
import { fetchPlanningJobs, type PlanningJob } from "@/lib/planning/parsePlanning";
import { siteSuggestionsByTeam } from "@/lib/planning/siteSuggestions";

// Данные для экрана контролёра /controle : бригады с составом, подсказки объектов из планинга
// и последние записи этого контролёра. Только роли controleur / rh_admin.

const NO_STORE = { "Cache-Control": "no-store" };
let planningCache: { at: number; jobs: PlanningJob[] } | null = null;

export async function GET() {
  const check = await requireRole(["controleur", "rh_admin"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });

  const [{ data: teams }, { data: emps }] = await Promise.all([
    sb.from("teams").select("id, name").order("name"),
    sb.from("employees").select("id, first_name, last_name, team_id").eq("category", "chantier").eq("status", "active").not("team_id", "is", null).order("last_name"),
  ]);

  const teamList = (teams ?? [])
    .map((t) => ({
      id: t.id as string,
      name: t.name as string,
      number: String(t.name ?? "").replace(/\D+/g, ""),
      members: (emps ?? [])
        .filter((e) => e.team_id === t.id)
        .map((e) => ({ id: e.id as string, name: `${String(e.last_name).toUpperCase()} ${e.first_name}` })),
    }))
    .filter((t) => t.members.length > 0)
    .sort((a, b) => Number(a.number || 999) - Number(b.number || 999) || a.name.localeCompare(b.name));

  // Объекты команд из планинга : окно = предыдущий + текущий месяц. Подсказки, не обязательные.
  let sitesByTeam: Record<string, string[]> = {};
  try {
    if (!planningCache || Date.now() - planningCache.at > 5 * 60 * 1000) planningCache = { at: Date.now(), jobs: await fetchPlanningJobs() };
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    sitesByTeam = siteSuggestionsByTeam(planningCache.jobs, from, to);
  } catch {
    sitesByTeam = {};
  }

  // Последние записи (30 дней) : свои у контролёра, все у rh_admin.
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  let q = sb
    .from("control_penalties")
    .select(
      "id, batch_id, created_at, inspection_date, site, team_id, catalog_code, stage, description, unit, qty, team_amount, divisor, share_each, note, photo_paths, created_by_email, status, control_penalty_targets(employee_id, share)"
    )
    .gte("inspection_date", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (check.ctx.role !== "rh_admin") q = q.eq("created_by_email", check.ctx.email);
  const { data: recent } = await q;

  return NextResponse.json(
    { email: check.ctx.email, role: check.ctx.role, teams: teamList, sitesByTeam, recent: recent ?? [] },
    { headers: NO_STORE }
  );
}
