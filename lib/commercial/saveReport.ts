import type { SupabaseClient } from "@supabase/supabase-js";
import { FILES_BUCKET, cleanName, newStoragePath } from "@/lib/commercial/files";
import { loadNorms, planLines, type PlanCatalogPos } from "@/lib/commercial/plan";
import { buildReportWorkbook, type ReportRow } from "@/lib/commercial/reportXlsx";

// Собирает контрандю объекта (Excel) и кладёт в папку « Compte rendu » этого объекта.
// Файл один на объект: при повторной сборке заменяется. Видно бригаде (цен в файле нет).

export const REPORT_FOLDER = "Compte rendu";

/** Контрандю готово, когда у каждой работы есть фактическая дата окончания. */
export function isReportComplete(lines: { actual_end: string | null }[]): boolean {
  return lines.length > 0 && lines.every((l) => !!l.actual_end);
}

export async function saveObjectReport(sb: SupabaseClient, objectId: string, by: string): Promise<{ ok: true; name: string; created: boolean } | { ok: false; error: string }> {
  const { data: obj } = await sb.from("work_objects").select("id, name, team_id, variant, power_kwc, start_date").eq("id", objectId).maybeSingle();
  if (!obj) return { ok: false, error: "Объект не найден" };
  const { data: lines } = await sb
    .from("work_object_lines")
    .select("position, section_code, catalog_position_id, label, unit, qty, measure, manual_days, parallel, actual_start, actual_end, delay_reason, subs")
    .eq("object_id", objectId)
    .order("position");
  if (!lines || lines.length === 0) return { ok: false, error: "У объекта нет работ - контрандю собирать не из чего" };
  const rows = lines.map((l) => ({ ...l, qty: Number(l.qty), measure: l.measure == null ? null : Number(l.measure), manual_days: l.manual_days == null ? null : Number(l.manual_days) }));

  const catIds = Array.from(new Set(rows.map((l) => l.catalog_position_id).filter((x): x is string => !!x)));
  const [{ data: cats }, { data: sections }, { data: team }, norms] = await Promise.all([
    catIds.length ? sb.from("work_positions").select("id, norm_standard, norm_lt, norm_ombriere, norm_basis").in("id", catIds) : Promise.resolve({ data: [] as PlanCatalogPos[] }),
    sb.from("work_sections").select("code, label"),
    obj.team_id ? sb.from("teams").select("name").eq("id", obj.team_id).maybeSingle() : Promise.resolve({ data: null }),
    loadNorms(sb),
  ]);
  const cat = new Map<string, PlanCatalogPos>((cats ?? []).map((c) => [c.id as string, c as PlanCatalogPos]));
  const plan = planLines(rows, { variant: obj.variant, power_kwc: obj.power_kwc == null ? null : Number(obj.power_kwc), start_date: obj.start_date }, cat, norms);
  const sectionLabel = new Map((sections ?? []).map((s) => [s.code as string, s.label as string]));

  const reportRows: ReportRow[] = rows.map((l, i) => ({
    section: l.section_code ? (sectionLabel.get(l.section_code) ?? null) : null,
    label: l.label,
    qty: l.qty,
    unit: l.unit,
    days: plan[i].days,
    planned_start: plan[i].start,
    planned_end: plan[i].end,
    actual_start: l.actual_start,
    actual_end: l.actual_end,
    delay_reason: l.delay_reason,
    // подстроки сметы (что именно входит в работу); строки с ценами в файл для бригады не попадают
    notes: Array.isArray(l.subs)
      ? (l.subs as { label?: string }[])
          .flatMap((x) => (x.label ?? "").split("\n"))
          .map((x) => x.trim())
          .filter((x) => x && !/(€|\beur\b|\bttc\b|\bht\b|\btva\b|prix|coût|cout)/i.test(x))
      : [],
  }));
  const wb = buildReportWorkbook({ name: obj.name, team: (team?.name as string | undefined) ?? null, variant: obj.variant, power_kwc: obj.power_kwc == null ? null : Number(obj.power_kwc), start_date: obj.start_date }, reportRows);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  const name = cleanName(`Compte rendu - ${obj.name}.xlsx`);
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const { data: existing } = await sb.from("work_object_files").select("id, storage_path").eq("object_id", objectId).eq("folder", REPORT_FOLDER).eq("name", name).maybeSingle();
  if (existing) {
    const up = await sb.storage.from(FILES_BUCKET).upload(existing.storage_path as string, buf, { contentType: mime, upsert: true });
    if (up.error) return { ok: false, error: up.error.message };
    await sb.from("work_object_files").update({ size_bytes: buf.length, created_at: new Date().toISOString(), uploaded_by: by, team_visible: true }).eq("id", existing.id as string);
    return { ok: true, name, created: false };
  }
  const path = newStoragePath(objectId, name);
  const up = await sb.storage.from(FILES_BUCKET).upload(path, buf, { contentType: mime });
  if (up.error) return { ok: false, error: up.error.message };
  const { error } = await sb.from("work_object_files").insert({ object_id: objectId, storage_path: path, folder: REPORT_FOLDER, name, size_bytes: buf.length, mime, source: "app", uploaded_by: by, team_visible: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, name, created: true };
}
