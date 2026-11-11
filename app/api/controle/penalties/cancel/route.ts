import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { serviceClient } from "@/lib/controle/server";
import { cancelRows, loadCancellable } from "@/lib/controle/cancel";

// Отмена записи (одной строки или всего контроля = batch_id) : возвращает суммы в Primes & Bonus,
// убирает строки причины и помечает записи как отменённые. Контролёр может отменить только свои записи
// за последние 48 часов, rh_admin - любые.

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const check = await requireRole(["controleur", "rh_admin"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });

  const body = (await request.json().catch(() => null)) as { batch_id?: string; penalty_id?: string; reason?: string } | null;
  const reason = String(body?.reason ?? "").trim().slice(0, 300) || null;
  if (!body?.batch_id && !body?.penalty_id) return NextResponse.json({ error: "Не указана запись" }, { status: 400, headers: NO_STORE });

  const loaded = await loadCancellable(sb, { batchId: body.batch_id, penaltyId: body.penalty_id, email: check.ctx.email, isAdmin: check.ctx.role === "rh_admin" });
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: NO_STORE });
  const res = await cancelRows(sb, loaded.rows, { reason, email: check.ctx.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, cancelled: res.cancelled }, { headers: NO_STORE });
}
