import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { buildDevisWorkbook, type DevisLine } from "@/lib/commercial/devisXlsx";

// Смета объекта в Excel (формат Modele_DEVIS_VLADIS). Роли: commercial, commercial_rh, rh_admin.
export async function GET(request: NextRequest) {
  const check = await requireRole(["commercial", "commercial_rh", "rh_admin"]);
  if (!check.ok) return check.response;
  const objectId = request.nextUrl.searchParams.get("objectId");
  if (!objectId) return NextResponse.json({ error: "objectId requis" }, { status: 400 });
  const { supabase } = check.ctx;

  const { data: obj } = await supabase.from("work_objects").select("id, name, power_kwc").eq("id", objectId).maybeSingle();
  if (!obj) return NextResponse.json({ error: "Objet introuvable" }, { status: 404 });
  const [{ data: lines }, { data: sections }] = await Promise.all([
    supabase.from("work_object_lines").select("position, section_code, label, unit, qty, price_ht, measure, subs").eq("object_id", objectId).order("position"),
    supabase.from("work_sections").select("code, label, position").order("position"),
  ]);

  const wb = buildDevisWorkbook({ name: String(obj.name), power_kwc: obj.power_kwc == null ? null : Number(obj.power_kwc) }, (lines ?? []) as DevisLine[], (sections ?? []) as { code: string; label: string }[]);
  const buffer = await wb.xlsx.writeBuffer();
  const safe = String(obj.name).replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "objet";
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DEVIS_${safe}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
