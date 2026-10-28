/**
 * Оспаривание штрафов контроля (решение от 28/10/2026).
 *
 * Возврат вносится в МЕСЯЦ РЕШЕНИЯ, в строке человека (`payroll_extras.penalite_contestee`, положительное число),
 * независимо от того, в каком месяце был сам штраф:
 *  - человек: возврат сразу добавляется в его БАНК 3000 (см. compute.ts, потолок 3000 не меняется);
 *  - контролёр: его 25% считаются от (штрафы месяца − возвраты месяца) × 25%; если получается меньше нуля, доля
 *    месяца = 0, а остаток («долг») переносится на следующие месяцы и уменьшает их доли. Из зарплаты ничего не
 *    удерживается - просто меньший будущий бонус;
 *  - Банк качества: штрафы бригады человека за период уменьшаются на возврат (75% - пул, итог не ниже нуля).
 */
import { CONTROLEUR_SHARE_RATE, QUALITY_BANK_SHARE_RATE } from "./compute";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 25% от (штрафы − возвраты) за один месяц; может быть отрицательным. */
export function controllerMonthDelta(penalties: number, refunds: number): number {
  return (Number(penalties) || 0) * CONTROLEUR_SHARE_RATE - (Number(refunds) || 0) * CONTROLEUR_SHARE_RATE;
}

/** Доля контролёра за текущий месяц с учётом переноса отрицательных остатков прошлых месяцев (от старых к новым). */
export function controllerShareWithCarry(priorDeltas: number[], currentDelta: number): number {
  let carry = 0;
  for (const d of priorDeltas) carry = Math.min(0, d + carry);
  return r2(Math.max(0, currentDelta + carry));
}

/** Банковская доля месяца (75% от штрафов − возвратов), не ниже нуля. */
export function bankShareOfMonth(penalties: number, refunds: number): number {
  return r2(Math.max(0, (Number(penalties) || 0) - (Number(refunds) || 0)) * QUALITY_BANK_SHARE_RATE);
}

// Минимальный тип клиента Supabase (подходит и для браузерного, и для серверного).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (table: string) => any };

/**
 * Дельты контролёра за ПРОШЛЫЕ месяцы (от старых к новым), начиная с первого месяца, где вносили возврат.
 * Если возвратов до текущего месяца не было, переносить нечего: возвращает [].
 * `currentMonth` - "YYYY-MM".
 */
export async function fetchControllerCarryDeltas(sb: Sb, currentMonth: string): Promise<number[]> {
  const { data: refundLines } = await sb.from("payroll_extras").select("run_id, penalite_contestee").gt("penalite_contestee", 0);
  if (!refundLines || refundLines.length === 0) return [];
  const { data: runs } = await sb.from("payroll_runs").select("id, month");
  const monthOf = new Map<string, string>(((runs ?? []) as { id: string; month: string }[]).map((r) => [r.id, String(r.month).slice(0, 7)]));
  const refundMonths = (refundLines as { run_id: string }[]).map((l) => monthOf.get(l.run_id)).filter((m): m is string => !!m && m < currentMonth);
  if (refundMonths.length === 0) return [];
  const first = refundMonths.sort()[0];
  const runIds = Array.from(monthOf.entries()).filter(([, m]) => m >= first && m < currentMonth).map(([id]) => id);
  if (runIds.length === 0) return [];
  const { data: emps } = await sb.from("employees").select("id, category, team_id, contract_type");
  const inTeam = new Set(
    ((emps ?? []) as { id: string; category: string; team_id: string | null; contract_type: string | null }[])
      .filter((e) => e.category === "chantier" && !!e.team_id && e.contract_type !== "FOP")
      .map((e) => e.id)
  );
  const lines: { run_id: string; employee_id: string; penalite_montant: number | null; penalite_contestee: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb
      .from("payroll_extras")
      .select("run_id, employee_id, penalite_montant, penalite_contestee")
      .in("run_id", runIds)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    lines.push(...data);
    if (data.length < 1000) break;
  }
  const byMonth = new Map<string, { p: number; r: number }>();
  lines.forEach((l) => {
    if (!inTeam.has(l.employee_id)) return;
    const m = monthOf.get(l.run_id);
    if (!m) return;
    const cur = byMonth.get(m) ?? { p: 0, r: 0 };
    cur.p += Math.max(0, -(Number(l.penalite_montant) || 0));
    cur.r += Math.max(0, Number(l.penalite_contestee) || 0);
    byMonth.set(m, cur);
  });
  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => controllerMonthDelta(v.p, v.r));
}
