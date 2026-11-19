import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { isSinaoConfigured, listOrganizations, SinaoError } from "@/lib/sinao/client";

// Список клиентов Sinao для выбора при отправке сметы. Роли: commercial, commercial_rh, rh_admin.
export async function GET() {
  const check = await requireRole(["commercial", "commercial_rh", "rh_admin"]);
  if (!check.ok) return check.response;
  if (!isSinaoConfigured()) return NextResponse.json({ error: "Sinao не подключён (нет ключа API)." }, { status: 503 });
  try {
    return NextResponse.json({ clients: await listOrganizations() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SinaoError) return NextResponse.json({ error: err.message }, { status: 502 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sinao request failed" }, { status: 500 });
  }
}
