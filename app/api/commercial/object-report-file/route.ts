import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { serviceClient } from "@/lib/controle/server";
import { saveObjectReport } from "@/lib/commercial/saveReport";

// Контрандю для команды из сметы объекта: Excel (работы, плановые дни и даты по нормам, пустые колонки факта, без цен)
// кладётся в папку « Compte rendu » объекта. Вызывается при каждом изменении сметы (экран « Объекты ») и кнопкой в папке.
// POST { object_id }. Роли: commercial, commercial_rh, rh_admin, rh.
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const check = await requireRole(["commercial", "commercial_rh", "rh_admin", "rh"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });
  const body = (await request.json().catch(() => null)) as { object_id?: string } | null;
  if (!body?.object_id) return NextResponse.json({ error: "Не указан объект" }, { status: 400, headers: NO_STORE });
  const res = await saveObjectReport(sb, body.object_id, check.ctx.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ ok: true, name: res.name, created: res.created }, { headers: NO_STORE });
}
