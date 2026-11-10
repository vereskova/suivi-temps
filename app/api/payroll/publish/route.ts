import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Публикация / снятие публикации бонусов и штрафов за месяц (payroll_runs.extras_published_at, migration 0131).
// Доступ - у всех ролей, которые видят таблицу Primes & Bonus ; запись через service role,
// потому что RLS на payroll_runs разрешает UPDATE только rh_admin.

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const check = await requireRole(["rh_admin", "rh", "comptable", "rh_readonly", "commercial_rh"]);
  if (!check.ok) return check.response;

  const body = (await request.json().catch(() => null)) as { month?: string; publish?: boolean } | null;
  const month = String(body?.month ?? "");
  if (!/^\d{4}-\d{2}-01$/.test(month) || typeof body?.publish !== "boolean") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400, headers: NO_STORE });
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });
  const sb = createServiceClient(url, key, { auth: { persistSession: false } });

  const { data: run } = await sb.from("payroll_runs").select("id").eq("month", month).maybeSingle();
  if (!run) return NextResponse.json({ error: "Месяц не найден" }, { status: 404, headers: NO_STORE });

  const at = body.publish ? new Date().toISOString() : null;
  const { error } = await sb
    .from("payroll_runs")
    .update({ extras_published_at: at, extras_published_by: body.publish ? check.ctx.email : null })
    .eq("id", run.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ ok: true, published_at: at }, { headers: NO_STORE });
}
