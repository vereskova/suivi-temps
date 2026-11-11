import { NextRequest, NextResponse } from "next/server";
import { requireBrigadir } from "@/lib/brigadir/access";
import { loadNorms, planLines, type PlanCatalogPos } from "@/lib/commercial/plan";

// Объект команды бригадира: работы с плановыми днями и датами и фактом. Цен и сумм здесь нет.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const acc = await requireBrigadir();
  if (!acc.ok) return acc.response as NextResponse;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан объект" }, { status: 400, headers: NO_STORE });

  const { data: obj } = await acc.sb.from("work_objects").select("id, name, team_id, status, variant, power_kwc, start_date, finished_at").eq("id", id).maybeSingle();
  if (!obj || !acc.teams.some((t) => t.id === obj.team_id)) return NextResponse.json({ error: "Объект не найден" }, { status: 404, headers: NO_STORE });

  const { data: lines } = await acc.sb
    .from("work_object_lines")
    .select("id, position, section_code, catalog_position_id, label, unit, qty, measure, manual_days, parallel, actual_start, actual_end, delay_reason, subs")
    .eq("object_id", id)
    .order("position");
  const rows = (lines ?? []).map((l) => ({ ...l, qty: Number(l.qty), measure: l.measure == null ? null : Number(l.measure), manual_days: l.manual_days == null ? null : Number(l.manual_days) }));

  const catIds = Array.from(new Set(rows.map((l) => l.catalog_position_id).filter((x): x is string => !!x)));
  const [{ data: cats }, { data: sections }, norms] = await Promise.all([
    catIds.length ? acc.sb.from("work_positions").select("id, norm_standard, norm_lt, norm_ombriere, norm_basis").in("id", catIds) : Promise.resolve({ data: [] as PlanCatalogPos[] }),
    acc.sb.from("work_sections").select("code, label"),
    loadNorms(acc.sb),
  ]);
  const cat = new Map<string, PlanCatalogPos>((cats ?? []).map((c) => [c.id as string, c as PlanCatalogPos]));
  const plan = planLines(rows, { variant: obj.variant, power_kwc: obj.power_kwc == null ? null : Number(obj.power_kwc), start_date: obj.start_date }, cat, norms);
  const sectionLabel = new Map((sections ?? []).map((s) => [s.code as string, s.label as string]));

  return NextResponse.json(
    {
      object: { id: obj.id, name: obj.name, status: obj.status, variant: obj.variant, start_date: obj.start_date },
      lines: rows.map((l, i) => ({
        id: l.id,
        label: l.label,
        unit: l.unit,
        qty: l.qty,
        measure: l.measure,
        section: l.section_code ? (sectionLabel.get(l.section_code) ?? null) : null,
        parallel: l.parallel,
        days: plan[i].days,
        planned_start: plan[i].start,
        planned_end: plan[i].end,
        actual_start: l.actual_start,
        actual_end: l.actual_end,
        delay_reason: l.delay_reason,
        notes: Array.isArray(l.subs) ? (l.subs as { label?: string }[]).map((s) => s.label ?? "").filter(Boolean) : [],
      })),
    },
    { headers: NO_STORE }
  );
}
