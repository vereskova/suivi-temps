import { NextRequest, NextResponse } from "next/server";
import { requireBrigadir } from "@/lib/brigadir/access";

// Бригадир вносит факт по работе: дата начала, дата окончания, причина задержки. Только объекты своей команды.
const NO_STORE = { "Cache-Control": "no-store" };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function PATCH(request: NextRequest) {
  const acc = await requireBrigadir();
  if (!acc.ok) return acc.response as NextResponse;
  const body = (await request.json().catch(() => null)) as { line_id?: string; actual_start?: string | null; actual_end?: string | null; delay_reason?: string | null } | null;
  if (!body?.line_id) return bad("Не указана работа");

  const { data: line } = await acc.sb.from("work_object_lines").select("id, actual_start, actual_end, object_id, work_objects!inner(team_id)").eq("id", body.line_id).maybeSingle();
  const teamId = (line?.work_objects as unknown as { team_id: string | null } | null)?.team_id;
  if (!line || !teamId || !acc.teams.some((t) => t.id === teamId)) return bad("Работа не найдена", 404);

  const patch: Record<string, unknown> = {};
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (const key of ["actual_start", "actual_end"] as const) {
    if (!(key in body)) continue;
    const v = body[key];
    if (v === null || v === "") patch[key] = null;
    else if (typeof v === "string" && ISO.test(v)) {
      if (v > tomorrow) return bad("Дата не может быть в будущем");
      if (v < "2020-01-01") return bad("Некорректная дата");
      patch[key] = v;
    } else return bad("Некорректная дата");
  }
  if ("delay_reason" in body) patch.delay_reason = String(body.delay_reason ?? "").trim().slice(0, 300) || null;

  const start = (patch.actual_start ?? (("actual_start" in patch) ? null : line.actual_start)) as string | null;
  const end = (patch.actual_end ?? (("actual_end" in patch) ? null : line.actual_end)) as string | null;
  if (start && end && end < start) return bad("Окончание раньше начала");
  if (Object.keys(patch).length === 0) return bad("Нечего сохранять");

  const { error } = await acc.sb.from("work_object_lines").update(patch).eq("id", body.line_id);
  if (error) return bad("Не удалось сохранить: " + error.message, 500);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
