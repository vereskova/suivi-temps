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

  // Сколько работ в каждом объекте и сколько уже сделано (для строки « 3 из 12 » в списке)
  const ids = (objects ?? []).map((o) => o.id as string);
  const counts = new Map<string, { total: number; done: number }>();
  if (ids.length) {
    const { data: lines } = await acc.sb.from("work_object_lines").select("object_id, actual_end").in("object_id", ids).limit(20000);
    for (const l of lines ?? []) {
      const c = counts.get(l.object_id as string) ?? { total: 0, done: 0 };
      c.total++;
      if (l.actual_end) c.done++;
      counts.set(l.object_id as string, c);
    }
  }

  return NextResponse.json(
    {
      role: acc.role,
      email: acc.email,
      teams: acc.teams,
      team,
      token: (link?.token as string) ?? null,
      objects: (objects ?? []).map((o) => ({ ...o, total: counts.get(o.id as string)?.total ?? 0, done: counts.get(o.id as string)?.done ?? 0 })),
    },
    { headers: NO_STORE }
  );
}
