import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { loadPublishedCatalog } from "@/lib/controle/catalog";
import { serviceClient } from "@/lib/controle/server";

// Действующий (подтверждённый) справочник штрафов - для Primes & Bonus и экрана контролёра.
export async function GET() {
  const check = await requireRole(["rh_admin", "rh", "comptable", "rh_readonly", "controleur"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const cat = await loadPublishedCatalog(sb);
  return NextResponse.json(cat, { headers: { "Cache-Control": "no-store" } });
}
