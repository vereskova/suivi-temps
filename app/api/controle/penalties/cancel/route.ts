import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { applyToExtras, ddmm, ensureRun, monthStartIso, r2, serviceClient } from "@/lib/controle/server";

// Отмена записи (одной строки или всего контроля = batch_id) : возвращает суммы в Primes & Bonus
// и помечает записи как отменённые. Контролёр может отменить только свои записи за последние 48 часов,
// rh_admin - любые.

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const check = await requireRole(["controleur", "rh_admin"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });

  const body = (await request.json().catch(() => null)) as { batch_id?: string; penalty_id?: string; reason?: string } | null;
  const reason = String(body?.reason ?? "").trim().slice(0, 300) || null;
  if (!body?.batch_id && !body?.penalty_id) return NextResponse.json({ error: "Не указана запись" }, { status: 400, headers: NO_STORE });

  let q = sb.from("control_penalties").select("id, created_at, created_by_email, inspection_date, catalog_code, stage, status, control_penalty_targets(employee_id, share)").eq("status", "active");
  q = body.batch_id ? q.eq("batch_id", body.batch_id) : q.eq("id", body.penalty_id as string);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  if (!rows || rows.length === 0) return NextResponse.json({ error: "Запись не найдена или уже отменена" }, { status: 404, headers: NO_STORE });

  if (check.ctx.role !== "rh_admin") {
    const limit = Date.now() - 48 * 3600 * 1000;
    const forbidden = rows.some((r) => r.created_by_email !== check.ctx.email || new Date(r.created_at as string).getTime() < limit);
    if (forbidden) return NextResponse.json({ error: "Отменить можно только свои записи за последние 48 часов" }, { status: 403, headers: NO_STORE });
  }

  // Сумма возврата по каждому человеку (все строки одной даты/месяца).
  const byMonth = new Map<string, Map<string, { sum: number; lines: string[] }>>();
  for (const r of rows) {
    const month = monthStartIso(r.inspection_date as string);
    const m = byMonth.get(month) ?? new Map();
    for (const t of (r.control_penalty_targets ?? []) as { employee_id: string; share: number }[]) {
      const cur = m.get(t.employee_id) ?? { sum: 0, lines: [] as string[] };
      cur.sum = r2(cur.sum + Number(t.share));
      cur.lines.push(`${r.catalog_code ?? ""} ${r.stage}`.trim());
      m.set(t.employee_id, cur);
    }
    byMonth.set(month, m);
  }

  try {
    for (const [month, perEmp] of byMonth) {
      const runId = await ensureRun(sb, month);
      for (const [eid, v] of perEmp) {
        const first = rows[0].inspection_date as string;
        const text = `[${ddmm(first)}] ОТМЕНЕНО (${v.lines.join(", ")}): +${String(v.sum).replace(".", ",")} €${reason ? ` - ${reason}` : ""}`;
        await applyToExtras(sb, { runId, prevRunId: null, employeeId: eid, delta: v.sum, lines: text, email: check.ctx.email });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: "Не удалось вернуть сумму в Primes & Bonus: " + (err instanceof Error ? err.message : "") }, { status: 500, headers: NO_STORE });
  }

  const { error: updErr } = await sb
    .from("control_penalties")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by_email: check.ctx.email, cancel_reason: reason })
    .in("id", rows.map((r) => r.id));
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ ok: true, cancelled: rows.length }, { headers: NO_STORE });
}
