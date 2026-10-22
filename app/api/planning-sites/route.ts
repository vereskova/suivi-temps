import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { fetchPlanningJobs, type PlanningJob } from "@/lib/planning/parsePlanning";
import { siteSuggestionsByTeam } from "@/lib/planning/siteSuggestions";

// Подсказки « объект » для штрафов контролёра - см. lib/planning/siteSuggestions.ts.

let cache: { at: number; jobs: PlanningJob[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const check = await requireRole(["rh_admin", "comptable", "rh_readonly"]);
  if (!check.ok) return check.response;

  const now = new Date();
  const year = Number(request.nextUrl.searchParams.get("year")) || now.getFullYear();
  const month = Number(request.nextUrl.searchParams.get("month")) || now.getMonth() + 1;
  // Le contrôleur vérifie souvent un chantier fini le mois d'avant : fenêtre = mois précédent + mois affiché.
  const from = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), jobs: await fetchPlanningJobs() };
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Planning indisponible" }, { status: 500 });
  }

  return NextResponse.json({ sitesByTeam: siteSuggestionsByTeam(cache.jobs, from, to) }, { headers: { "Cache-Control": "no-store" } });
}
