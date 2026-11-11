import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { serviceClient } from "@/lib/controle/server";
import { fetchPlanningJobs } from "@/lib/planning/parsePlanning";
import { siteJobsInWindow } from "@/lib/planning/siteSuggestions";
import { matchStartDates } from "@/lib/planning/matchObjects";

// Даты начала объектов из планинга (Google Sheet): сопоставление по команде и названию.
//   POST { apply: false } - показать, что найдено;  POST { apply: true } - записать даты тем объектам, у которых даты ещё нет.
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const check = await requireRole(["commercial", "commercial_rh", "rh_admin"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });
  const body = (await request.json().catch(() => ({}))) as { apply?: boolean };

  let sites;
  try {
    sites = siteJobsInWindow(await fetchPlanningJobs(), `${new Date().getUTCFullYear() - 1}-01-01`, `${new Date().getUTCFullYear() + 1}-12-31`);
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать планинг (Google Sheets недоступен)" }, { status: 502, headers: NO_STORE });
  }
  const [{ data: teams }, { data: objs }] = await Promise.all([
    sb.from("teams").select("id, name"),
    sb.from("work_objects").select("id, name, team_id, start_date, status").is("start_date", null).limit(3000),
  ]);
  const num = new Map((teams ?? []).map((t) => [t.id as string, Number(String(t.name).replace(/\D/g, ""))]));
  const refs = (objs ?? []).map((o) => ({ id: o.id as string, name: o.name as string, team: num.get(o.team_id as string) ?? 0, start_date: null as string | null }));
  const matches = matchStartDates(refs, sites);

  if (body.apply) {
    for (const m of matches) await sb.from("work_objects").update({ start_date: m.job.from, updated_at: new Date().toISOString() }).eq("id", m.object.id).is("start_date", null);
  }
  return NextResponse.json(
    { withoutDate: refs.length, matched: matches.length, applied: !!body.apply, sample: matches.slice(0, 12).map((m) => ({ name: m.object.name, job: m.job.name, from: m.job.from })) },
    { headers: NO_STORE }
  );
}
