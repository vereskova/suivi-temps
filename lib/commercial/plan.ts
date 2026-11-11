import type { SupabaseClient } from "@supabase/supabase-js";
import { evalNorm, planSchedule, type NormDef } from "@/lib/commercial-durations/compute";

// Плановые дни и даты работ объекта на сервере (кабинет бригадира). Та же логика, что в экране « Объекты »:
// дни = ручные дни или норма выбранного варианта (Standard / Avec LT / Ombrière), даты - подряд по рабочим дням.

export type PlanObject = { variant: "standard" | "lt" | "ombriere"; power_kwc: number | null; start_date: string | null };
export type PlanLine = { catalog_position_id: string | null; qty: number; measure: number | null; manual_days: number | null; parallel: boolean };
export type PlanCatalogPos = { id: string; norm_standard: string | null; norm_lt: string | null; norm_ombriere: string | null; norm_basis: "power" | "qty" | "sub_measure" };

export async function loadNorms(sb: SupabaseClient): Promise<Record<string, NormDef>> {
  const [{ data: n }, { data: p }] = await Promise.all([
    sb.from("commercial_duration_norms").select("id, code, mode, overflow_step, overflow_days"),
    sb.from("commercial_duration_norm_points").select("norm_id, x, y, position").order("position"),
  ]);
  const map: Record<string, NormDef> = {};
  for (const row of n ?? []) {
    map[row.code as string] = {
      mode: row.mode as NormDef["mode"],
      overflowStep: row.overflow_step == null ? null : Number(row.overflow_step),
      overflowDays: row.overflow_days == null ? null : Number(row.overflow_days),
      points: (p ?? []).filter((pt) => pt.norm_id === row.id).map((pt) => ({ x: Number(pt.x), y: Number(pt.y) })),
    };
  }
  return map;
}

export function lineDays(l: PlanLine, obj: PlanObject, cat: Map<string, PlanCatalogPos>, norms: Record<string, NormDef>): number {
  if (l.manual_days != null) return Number(l.manual_days);
  const cp = l.catalog_position_id ? cat.get(l.catalog_position_id) : undefined;
  if (!cp) return 0;
  const code = obj.variant === "lt" ? cp.norm_lt : obj.variant === "ombriere" ? cp.norm_ombriere : cp.norm_standard;
  if (!code || !norms[code]) return 0;
  const x = cp.norm_basis === "power" ? (obj.power_kwc ?? 0) : cp.norm_basis === "sub_measure" ? (l.measure ?? l.qty) : l.qty;
  return x > 0 ? evalNorm(norms[code], x).jours : 0;
}

export function planLines(lines: PlanLine[], obj: PlanObject, cat: Map<string, PlanCatalogPos>, norms: Record<string, NormDef>) {
  const days = lines.map((l) => lineDays(l, obj, cat, norms));
  const sched = planSchedule(obj.start_date, lines.map((l, i) => ({ days: days[i], parallel: l.parallel })));
  return days.map((d, i) => ({ days: d, start: sched[i]?.start ?? null, end: sched[i]?.end ?? null }));
}
