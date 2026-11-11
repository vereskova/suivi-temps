import type { SupabaseClient } from "@supabase/supabase-js";
import { applyToExtras, ddmm, ensureRun, monthStartIso, r2 } from "./server";

export type CancelResult = { ok: true; cancelled: number } | { ok: false; status: number; error: string };

type Row = {
  id: string;
  created_at: string;
  created_by_email: string;
  inspection_date: string;
  site: string;
  note: string | null;
  catalog_code: string | null;
  stage: string;
  control_penalty_targets: { employee_id: string; share: number }[] | null;
};

const SELECT = "id, created_at, created_by_email, inspection_date, site, note, catalog_code, stage, status, control_penalty_targets(employee_id, share)";

/** Загрузка активных строк проверки + проверка прав (контролёр: только свои, не старше 48 часов; rh_admin: любые). */
export async function loadCancellable(
  sb: SupabaseClient,
  args: { batchId?: string; penaltyId?: string; email: string; isAdmin: boolean }
): Promise<{ ok: true; rows: Row[] } | { ok: false; status: number; error: string }> {
  let q = sb.from("control_penalties").select(SELECT).eq("status", "active");
  q = args.batchId ? q.eq("batch_id", args.batchId) : q.eq("id", args.penaltyId as string);
  const { data, error } = await q;
  if (error) return { ok: false, status: 500, error: error.message };
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return { ok: false, status: 404, error: "Запись не найдена или уже отменена" };
  if (!args.isAdmin) {
    const limit = Date.now() - 48 * 3600 * 1000;
    if (rows.some((r) => r.created_by_email !== args.email || new Date(r.created_at).getTime() < limit)) {
      return { ok: false, status: 403, error: "Менять и отменять можно только свои записи за последние 48 часов" };
    }
  }
  return { ok: true, rows };
}

/** Возврат сумм в Primes & Bonus (с удалением строк причины) и пометка записей как отменённых. */
export async function cancelRows(sb: SupabaseClient, rows: Row[], args: { reason: string | null; email: string }): Promise<CancelResult> {
  const byMonth = new Map<string, Map<string, { sum: number; prefixes: string[]; exact: string[] }>>();
  for (const r of rows) {
    const month = monthStartIso(r.inspection_date);
    const m = byMonth.get(month) ?? new Map();
    // Та же строка, которую записывал POST : « [dd/mm] объект · код этап - ... »
    const prefix = `[${ddmm(r.inspection_date)}] ${String(r.site).trim()} · ${r.catalog_code ?? ""} ${r.stage} -`;
    for (const t of r.control_penalty_targets ?? []) {
      const cur = m.get(t.employee_id) ?? { sum: 0, prefixes: [] as string[], exact: [] as string[] };
      cur.sum = r2(cur.sum + Number(t.share));
      if (r.catalog_code) cur.prefixes.push(prefix);
      m.set(t.employee_id, cur);
    }
    byMonth.set(month, m);
  }
  const noteLine = rows.find((r) => r.note)?.note;
  if (noteLine) for (const m of byMonth.values()) for (const v of m.values()) v.exact.push(`(${noteLine})`);

  try {
    for (const [month, perEmp] of byMonth) {
      const runId = await ensureRun(sb, month);
      for (const [eid, v] of perEmp) {
        await applyToExtras(sb, {
          runId, prevRunId: null, employeeId: eid, delta: v.sum, lines: "", email: args.email,
          removePrefixes: v.prefixes, removeExact: v.exact, clampMaxZero: true,
        });
      }
    }
  } catch (err) {
    return { ok: false, status: 500, error: "Не удалось вернуть сумму в Primes & Bonus: " + (err instanceof Error ? err.message : "") };
  }
  const { error } = await sb
    .from("control_penalties")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by_email: args.email, cancel_reason: args.reason })
    .in("id", rows.map((r) => r.id));
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, cancelled: rows.length };
}
