import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { serviceClient } from "@/lib/controle/server";

// Прежнее контрандю объекта (таблицы « Compte rendu » из папки объекта) - для просмотра.
// Роли: rh_admin, commercial, commercial_rh, rh_readonly (Production).
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const check = await requireRole(["rh_admin", "commercial", "commercial_rh", "rh_readonly"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });
  const objectId = request.nextUrl.searchParams.get("objectId");
  if (!objectId) return NextResponse.json({ error: "Не указан объект" }, { status: 400, headers: NO_STORE });
  const { data, error } = await sb.from("work_object_reports").select("id, file_name, file_mtime, sheets").eq("object_id", objectId).order("file_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ reports: data ?? [] }, { headers: NO_STORE });
}
