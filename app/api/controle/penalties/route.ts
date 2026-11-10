import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireRole } from "@/lib/auth/requireRole";
import { PENALTY_CATALOG, PENALTY_DEFAULT_DIVISOR, describePenaltyPick } from "@/lib/payroll/penalties";
import { applyToExtras, ddmm, ensureRun, monthStartIso, prevMonthStartIso, r2, serviceClient } from "@/lib/controle/server";

// Запись штрафов контролёра : журнал (control_penalties + control_penalty_targets) и сразу же
// « Штраф контроль » + причина каждого члена бригады в Primes & Bonus (payroll_extras).
// Суммы всегда пересчитываются здесь по справочнику, а не берутся от клиента.

const NO_STORE = { "Cache-Control": "no-store" };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

type ItemInput = { code?: string; qty?: number; amount?: number; photo_paths?: string[] };
type Body = {
  inspection_date?: string;
  site?: string;
  team_id?: string;
  items?: ItemInput[];
  employee_ids?: string[];
  divisor?: number;
  note?: string;
  photo_paths?: string[];
  clean?: boolean;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const check = await requireRole(["controleur", "rh_admin"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return bad("Некорректный запрос");

  const date = String(body.inspection_date ?? "");
  const site = String(body.site ?? "").trim().replace(/\s+/g, " ");
  const teamId = String(body.team_id ?? "");
  const note = String(body.note ?? "").trim().slice(0, 600) || null;
  const items = Array.isArray(body.items) ? body.items : [];
  const clean = body.clean === true;
  const divisor = Number(body.divisor) > 0 ? Number(body.divisor) : PENALTY_DEFAULT_DIVISOR;
  const photoPaths = (Array.isArray(body.photo_paths) ? body.photo_paths : []).filter((p) => typeof p === "string" && p.length < 300).slice(0, 8);

  if (!ISO.test(date)) return bad("Укажите дату проверки");
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const tomorrowIso = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  if (date > tomorrowIso) return bad("Дата проверки в будущем");
  const earliest = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  if (date < earliest) return bad("Дата слишком старая: штрафы можно вносить за текущий и прошлый месяц");
  if (site.length < 2 || site.length > 120) return bad("Укажите название объекта");
  if (!clean && items.length === 0) return bad("Выберите хотя бы одну ошибку");
  if (items.length > 25) return bad("Слишком много пунктов за один раз");

  const { data: team } = await sb.from("teams").select("id, name").eq("id", teamId).maybeSingle();
  if (!team) return bad("Бригада не найдена");

  const employeeIds = Array.from(new Set(Array.isArray(body.employee_ids) ? body.employee_ids.map(String) : []));
  if (!clean && employeeIds.length === 0) return bad("Отметьте, на кого делится штраф");
  const { data: members } = await sb
    .from("employees")
    .select("id, first_name, last_name")
    .eq("team_id", teamId)
    .eq("status", "active")
    .in("id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
  if (!clean && (members ?? []).length !== employeeIds.length) return bad("Есть люди, которых нет в этой бригаде");

  // Пересчёт каждого пункта по справочнику.
  const computed: { item: (typeof PENALTY_CATALOG)[number]; qty: number; base: number; teamAmount: number; share: number; line: string; photos: string[] }[] = [];
  for (const it of items) {
    const catalogItem = PENALTY_CATALOG.find((c) => c.code === it.code);
    if (!catalogItem) return bad(`Неизвестный пункт справочника: ${String(it.code)}`);
    const qty = Number(it.qty);
    const amount = Number(it.amount);
    if ((catalogItem.unit === "per_piece" || catalogItem.unit === "per_day") && !(qty > 0 && qty <= 1000)) return bad(`${catalogItem.code}: укажите количество`);
    if (catalogItem.unit === "manual" && !(amount > 0 && amount <= 20000)) return bad(`${catalogItem.code}: укажите сумму на команду`);
    if (catalogItem.unit === "range") {
      const min = catalogItem.amount;
      const max = catalogItem.amountMax ?? catalogItem.amount;
      if (!(amount >= min && amount <= max)) return bad(`${catalogItem.code}: сумма от ${min} до ${max} €`);
    }
    const pick = describePenaltyPick({
      item: catalogItem,
      qty: catalogItem.unit === "per_piece" || catalogItem.unit === "per_day" ? qty : 1,
      rangeAmount: catalogItem.unit === "range" || catalogItem.unit === "manual" ? amount : undefined,
      site,
      divisor,
    });
    const base =
      catalogItem.unit === "range" || catalogItem.unit === "manual" ? amount : catalogItem.amount;
    // Фото именно этого пункта (загружены через /api/controle/photo в папку пользователя).
    const photos = (Array.isArray(it.photo_paths) ? it.photo_paths : [])
      .filter((x) => typeof x === "string" && x.startsWith(`${check.ctx.userId}/`) && x.length < 300)
      .slice(0, 6);
    computed.push({ item: catalogItem, qty: catalogItem.unit === "per_piece" || catalogItem.unit === "per_day" ? qty : 1, base, teamAmount: pick.teamAmount, share: pick.share, line: pick.line, photos });
  }

  const batchId = randomUUID();
  const rows: Record<string, unknown>[] = clean
    ? [
        {
          batch_id: batchId, inspection_date: date, site, team_id: teamId, catalog_code: null, stage: "Проверка без замечаний",
          description: note ?? "Замечаний нет", severity: null, unit: "fixed", qty: 1, unit_amount: 0, team_amount: 0, divisor,
          share_each: 0, note, photo_paths: photoPaths, created_by_email: check.ctx.email, created_by_user: check.ctx.userId,
        },
      ]
    : computed.map((c) => ({
        batch_id: batchId, inspection_date: date, site, team_id: teamId, catalog_code: c.item.code, stage: c.item.stage,
        description: c.item.description, severity: c.item.severity, unit: c.item.unit, qty: c.qty, unit_amount: r2(c.base),
        team_amount: c.teamAmount, divisor, share_each: c.share, note, photo_paths: c.photos,
        created_by_email: check.ctx.email, created_by_user: check.ctx.userId,
      }));

  const { data: inserted, error: insErr } = await sb.from("control_penalties").insert(rows).select("id, catalog_code, share_each");
  if (insErr || !inserted) return bad("Не удалось сохранить: " + (insErr?.message ?? ""), 500);

  const rollbackJournal = async () => {
    await sb.from("control_penalties").delete().eq("batch_id", batchId);
  };

  if (clean) {
    return NextResponse.json({ ok: true, batch_id: batchId, penalties: inserted.length, applied: 0 }, { headers: NO_STORE });
  }

  // Цели : доля каждого штрафа на каждого человека.
  const targetRows = inserted.flatMap((p) => employeeIds.map((eid) => ({ penalty_id: p.id, employee_id: eid, share: p.share_each })));
  const { error: tErr } = await sb.from("control_penalty_targets").insert(targetRows);
  if (tErr) {
    await rollbackJournal();
    return bad("Не удалось сохранить получателей: " + tErr.message, 500);
  }

  // Запись в Primes & Bonus (payroll_extras) месяца проверки.
  const monthIso = monthStartIso(date);
  let applied: string[] = [];
  const totalShare = r2(computed.reduce((s, c) => s + c.share, 0));
  const linesText = computed.map((c) => `[${ddmm(date)}] ${c.line}`).join("\n") + (note ? `\n(${note})` : "");
  try {
    const runId = await ensureRun(sb, monthIso);
    const { data: prevRun } = await sb.from("payroll_runs").select("id").eq("month", prevMonthStartIso(date)).maybeSingle();
    for (const eid of employeeIds) {
      await applyToExtras(sb, { runId, prevRunId: (prevRun?.id as string) ?? null, employeeId: eid, delta: -totalShare, lines: linesText, email: check.ctx.email });
      applied = [...applied, eid];
    }
  } catch (err) {
    // откат: вернуть уже записанных и убрать журнал
    try {
      const runId = await ensureRun(sb, monthIso);
      for (const eid of applied) {
        await applyToExtras(sb, { runId, prevRunId: null, employeeId: eid, delta: totalShare, lines: `[${ddmm(date)}] ОТКАТ неудавшейся записи: +${String(totalShare).replace(".", ",")} €`, email: check.ctx.email });
      }
    } catch {
      /* ignoré : message d'erreur ci-dessous */
    }
    await rollbackJournal();
    return bad("Не удалось записать в Primes & Bonus: " + (err instanceof Error ? err.message : "ошибка"), 500);
  }

  return NextResponse.json(
    { ok: true, batch_id: batchId, penalties: inserted.length, applied: applied.length, share_each: totalShare, team_total: r2(computed.reduce((s, c) => s + c.teamAmount, 0)), today: todayIso },
    { headers: NO_STORE }
  );
}
