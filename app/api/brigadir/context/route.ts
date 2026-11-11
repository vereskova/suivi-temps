import { NextRequest, NextResponse } from "next/server";
import { requireBrigadir } from "@/lib/brigadir/access";

// Кабинет бригадира: команда, её объекты и ссылка на страницу премий. rh_admin выбирает команду параметром ?team=.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const acc = await requireBrigadir();
  if (!acc.ok) return acc.response as NextResponse;
  if (acc.teams.length === 0) return NextResponse.json({ error: "Вы не привязаны к команде. Обратитесь в офис." }, { status: 403, headers: NO_STORE });

  const wanted = request.nextUrl.searchParams.get("team");
  const team = acc.teams.find((t) => t.id === wanted) ?? acc.teams[0];

  const [{ data: objects }, { data: link }] = await Promise.all([
    acc.sb.from("work_objects").select("id, name, status, variant, start_date, finished_at").eq("team_id", team.id).order("name"),
    acc.sb.from("team_access_links").select("token").eq("team_id", team.id).maybeSingle(),
  ]);

  return NextResponse.json(
    { role: acc.role, email: acc.email, teams: acc.teams, team, token: (link?.token as string) ?? null, objects: objects ?? [] },
    { headers: NO_STORE }
  );
}
