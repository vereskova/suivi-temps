import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { computeControllerSplit, computePayrollExtras } from "@/lib/payroll/compute";
import {
  aggregateTeamDays,
  allocatePenaltiesToTeams,
  daysInTeam,
  fetchAllPages,
  nextQualityBankPayoutDate,
  rankTeamsForQualityBank,
  splitByDays,
  QUALITY_BANK_EXCLUDED_WORST,
  type PeriodLine,
  type TeamStanding,
} from "@/lib/payroll/quality-bank";

// Lecture seule des lignes Primes & Bonus d'UNE équipe, pour la page
// /equipe/<jeton> ouverte depuis le téléphone de l'équipe. Pas de session :
// le jeton (table team_access_links, lisible seulement par rh_admin) identifie
// l'équipe, et seules les lignes de cette équipe sont renvoyées. Mêmes formules
// que l'écran RH (computePayrollExtras) — le Банк качества et la part du
// contrôleur se calculent sur toute l'entreprise, mais rien d'autre ne sort.

// Même contrôleur que PayrollExtrasView (QUALITY_BANK_CONTROLLER_EMPLOYEE_ID).
const QUALITY_BANK_CONTROLLER_EMPLOYEE_ID = "878a6357-4f00-4571-8fee-5b5081716dc4";

const NO_STORE = { "Cache-Control": "no-store" };

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const toISO = (d: Date) => d.toISOString().split("T")[0];
  return { start: toISO(start), end: toISO(end), daysInMonth: end.getUTCDate() };
}

type ExtrasRow = Record<string, number | string | null> & { employee_id: string };

export async function GET(request: NextRequest) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });
  }

  const params = request.nextUrl.searchParams;
  const token = params.get("token") ?? "";
  const now = new Date();
  const year = Number(params.get("year")) || now.getFullYear();
  const month = Number(params.get("month")) || now.getMonth() + 1;
  if (!/^[0-9a-f]{32,128}$/.test(token) || month < 1 || month > 12 || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404, headers: NO_STORE });
  }

  const sb = createServiceClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: link } = await sb.from("team_access_links").select("team_id, teams(name, chef_employee_id)").eq("token", token).maybeSingle();
  if (!link) return NextResponse.json({ error: "Lien invalide" }, { status: 404, headers: NO_STORE });
  const teamId = link.team_id as string;
  const team = link.teams as unknown as { name: string; chef_employee_id: string | null } | null;

  const monthIso = `${year}-${String(month).padStart(2, "0")}-01`;
  const { start: monthStart, end: monthEnd, daysInMonth } = monthRange(year, month);

  // Même sélection que l'écran RH, pour toute l'entreprise (nécessaire au total des pénalités).
  const { data: allEmp } = await sb
    .from("employees")
    .select("id, first_name, last_name, category, team_id, contract_type, status, hire_date, end_date, is_driver, teams!employees_team_id_fkey(name)")
    .or(
      `status.eq.active,` +
        `and(status.eq.on_leave,end_date.gte.${monthIso}),` +
        `and(status.eq.on_leave,end_date.is.null),` +
        `and(status.eq.terminated,end_date.gte.${monthIso})`
    );
  type Emp = {
    id: string;
    first_name: string;
    last_name: string;
    category: string;
    team_id: string | null;
    contract_type: string | null;
    hire_date: string | null;
    is_driver: boolean | null;
    teams: { name: string } | null;
  };
  const employees = (allEmp ?? []) as unknown as Emp[];
  const faitPartieEquipe = (e: Emp) => e.category === "chantier" && !!e.team_id && !!e.teams?.name;
  const teamEmployees = employees.filter((e) => e.team_id === teamId && e.contract_type !== "FOP");

  const { data: run } = await sb.from("payroll_runs").select("id").eq("month", monthIso).maybeSingle();
  const lines: ExtrasRow[] = run?.id
    ? (((await sb.from("payroll_extras").select("*").eq("run_id", run.id)).data ?? []) as ExtrasRow[])
    : [];
  const lineByEmployee = new Map(lines.map((l) => [l.employee_id, l]));

  const prev = new Date(Date.UTC(year, month - 2, 1));
  const prevMonthIso = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { data: prevRun } = await sb.from("payroll_runs").select("id").eq("month", prevMonthIso).maybeSingle();
  const prevByEmployee = new Map<string, { fin: number; taux: number }>();
  if (prevRun?.id) {
    const { data: prevLines } = await sb
      .from("payroll_extras")
      .select("employee_id, banque_qualite_fin, taux_journalier")
      .eq("run_id", prevRun.id);
    (prevLines ?? []).forEach((l) =>
      prevByEmployee.set(l.employee_id, { fin: Number(l.banque_qualite_fin) || 0, taux: Number(l.taux_journalier) || 0 })
    );
  }

  const teamIds = teamEmployees.map((e) => e.id);
  // Стаж : самая ранняя дата входа в регистре (повторные найм не обнуляют стаж), иначе hire_date.
  const { data: regRows } = teamIds.length
    ? await sb.from("registre_unique_personnel").select("employee_id, date_entree").in("employee_id", teamIds)
    : { data: [] };
  const firstEntry = new Map<string, string>();
  (regRows ?? []).forEach((r) => {
    if (!r.date_entree) return;
    const cur = firstEntry.get(r.employee_id);
    if (!cur || r.date_entree < cur) firstEntry.set(r.employee_id, r.date_entree);
  });
  const { data: pointage } = teamIds.length
    ? await sb
        .from("pointage_entries")
        .select("employee_id, work_date, is_absent, half_day, absence_types(code, label)")
        .in("employee_id", teamIds)
        .gte("work_date", monthStart)
        .lte("work_date", monthEnd)
    : { data: [] };
  const daysByEmployee = new Map<string, Record<string, { worked: boolean; half: boolean; absence: string | null }>>();
  (pointage ?? []).forEach((p) => {
    const abs = p.absence_types as unknown as { code: string; label: string } | null;
    const m = daysByEmployee.get(p.employee_id) ?? {};
    m[p.work_date] = { worked: !p.is_absent, half: !p.is_absent && !!p.half_day, absence: p.is_absent ? (abs?.label ?? abs?.code ?? "") : null };
    daysByEmployee.set(p.employee_id, m);
  });

  // 25 % du total des pénalités chantier de toute l'entreprise → contrôleur désigné.
  const totalPenalites = employees.reduce((sum, e) => {
    if (e.contract_type === "FOP" || !faitPartieEquipe(e)) return sum;
    return sum + Math.max(0, -(Number(lineByEmployee.get(e.id)?.penalite_montant) || 0));
  }, 0);
  const controllerShare = computeControllerSplit(totalPenalites).controllerShare;

  const rows = teamEmployees
    .map((e) => {
      const l = lineByEmployee.get(e.id);
      const p = prevByEmployee.get(e.id);
      const dayMap = daysByEmployee.get(e.id) ?? {};
      const jours = Object.values(dayMap).reduce((s, d) => s + (d.worked ? (d.half ? 0.5 : 1) : 0), 0);
      const taux = l ? Number(l.taux_journalier) || 0 : p?.taux || 0;
      const num = (v: unknown) => Number(v) || 0;
      const manual = l?.banque_ajustement_manuel;
      const r = computePayrollExtras({
        jours,
        tauxJournalier: taux,
        heuresRoute: num(l?.heures_route),
        estChauffeur: e.is_driver ?? false,
        bonusEquipe: num(l?.bonus_equipe),
        bonusDirect: num(l?.bonus_direct),
        penaliteMontant: num(l?.penalite_montant),
        penaliteDirecte: num(l?.penalite_directe),
        banqueQualitePrecedente: p ? p.fin : null,
        banqueAjustementManuel: manual === null || manual === undefined ? null : Number(manual),
        faitPartieEquipe: faitPartieEquipe(e),
        controleBonusRecu: e.id === QUALITY_BANK_CONTROLLER_EMPLOYEE_ID ? controllerShare : 0,
        banqueQualitePrime: num(l?.banque_qualite_prime),
      });
      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const date = `${monthStart.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
        const d = dayMap[date];
        return { date, state: !d ? null : d.worked ? (d.half ? "half" : "full") : "absent", absence: d?.absence ?? null };
      });
      return {
        id: e.id,
        name: `${e.last_name} ${e.first_name}`,
        isChef: team?.chef_employee_id === e.id,
        isDriver: e.is_driver ?? false,
        hireDate: firstEntry.get(e.id) ?? e.hire_date ?? null,
        jours,
        taux,
        bonusEquipe: num(l?.bonus_equipe),
        bonusRaison: (l?.bonus_raison as string) || "",
        bonusDirect: num(l?.bonus_direct),
        bonusDirectRaison: (l?.bonus_direct_raison as string) || "",
        penalite: num(l?.penalite_montant),
        penaliteRaison: (l?.penalite_raison as string) || "",
        penaliteDirecte: num(l?.penalite_directe),
        penaliteDirecteRaison: (l?.penalite_directe_raison as string) || "",
        heuresRoute: num(l?.heures_route),
        avance: num(l?.avance),
        result: r,
        days,
      };
    })
    .sort((a, b) => Number(b.isChef) - Number(a.isChef) || a.name.localeCompare(b.name));

  // ── Банк качества : classement des équipes sur la période en cours (« à ce jour »). ──
  // Pool et classement viennent de TOUTES les équipes ; chaque équipe voit le
  // classement complet (rang, pénalités, part du jour) et la part de ses membres.
  // Les changements d'équipe en cours de période sont suivis jour par jour (voir quality-bank.ts).
  let qualityBank: unknown = null;
  const { data: bankRow } = await sb.from("company_quality_bank").select("period_start").limit(1).maybeSingle();
  if (bankRow?.period_start) {
    const periodMonth = `${String(bankRow.period_start).slice(0, 7)}-01`;
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: pRuns } = await sb.from("payroll_runs").select("id, month").gte("month", periodMonth);
    const runMonth = new Map((pRuns ?? []).map((r) => [r.id as string, String(r.month).slice(0, 7)]));
    const pRunIds = Array.from(runMonth.keys());
    type BankLine = { run_id: string; employee_id: string; penalite_montant: number | null; bonus_equipe: number | null };
    const pLines = pRunIds.length
      ? await fetchAllPages<BankLine>((from, to) =>
          sb.from("payroll_extras").select("run_id, employee_id, penalite_montant, bonus_equipe").in("run_id", pRunIds).range(from, to)
        )
      : [];
    const { data: bankEmps } = await sb
      .from("employees")
      .select("id, first_name, last_name, category, team_id, contract_type, status, teams!employees_team_id_fkey(name)");
    type BankEmp = {
      id: string;
      first_name: string;
      last_name: string;
      category: string;
      team_id: string | null;
      contract_type: string | null;
      status: string;
      teams: { name: string } | null;
    };
    const inTeam = (e: BankEmp) => e.category === "chantier" && !!e.team_id && !!e.teams?.name && e.contract_type !== "FOP";
    const teamEmps = ((bankEmps ?? []) as unknown as BankEmp[]).filter(inTeam);
    const empById = new Map(teamEmps.map((e) => [e.id, e]));
    const teamEmpIds = teamEmps.map((e) => e.id);

    const periodLines: PeriodLine[] = pLines
      .filter((l) => empById.has(l.employee_id))
      .map((l) => ({
        employeeId: l.employee_id,
        month: runMonth.get(l.run_id) ?? "",
        penalty: Math.max(0, -(Number(l.penalite_montant) || 0)),
        bonus: Number(l.bonus_equipe) || 0,
      }));
    const periodPenalties = periodLines.reduce((sum, l) => sum + l.penalty, 0);
    const pointageRows = teamEmpIds.length
      ? await fetchAllPages<{ employee_id: string; team_id: string; work_date: string; is_absent: boolean; half_day: boolean | null }>((from, to) =>
          sb
            .from("pointage_entries")
            .select("employee_id, team_id, work_date, is_absent, half_day")
            .in("employee_id", teamEmpIds)
            .gte("work_date", periodMonth)
            .lte("work_date", todayIso)
            .order("work_date")
            .order("employee_id")
            .range(from, to)
        )
      : [];
    const dayRows = aggregateTeamDays(pointageRows);
    const allocated = allocatePenaltiesToTeams(periodLines, dayRows, (id) => empById.get(id)?.team_id ?? null);

    const totals = new Map<string, TeamStanding>();
    teamEmps
      .filter((e) => e.status === "active")
      .forEach((e) => {
        if (totals.has(e.team_id as string)) return;
        const a = allocated.get(e.team_id as string);
        totals.set(e.team_id as string, { teamId: e.team_id as string, name: e.teams!.name, penalties: a?.penalties ?? 0, bonus: a?.bonus ?? 0 });
      });
    const pool = computeControllerSplit(periodPenalties).bankShare;
    const ranked = rankTeamsForQualityBank(Array.from(totals.values()), pool);
    const mine = ranked.find((t) => t.teamId === teamId);
    let members: { id: string; name: string; days: number; amount: number }[] = [];
    if (mine) {
      // Tous les salariés actifs qui ont travaillé dans cette équipe sur la période (même s'ils l'ont quittée depuis).
      const myDays = daysInTeam(dayRows, teamId);
      const list = teamEmps
        .filter((e) => e.status === "active" && ((myDays.get(e.id) ?? 0) > 0 || e.team_id === teamId))
        .map((e) => ({ id: e.id, name: `${e.last_name} ${e.first_name}`, days: myDays.get(e.id) ?? 0 }));
      const split = mine.eligible ? splitByDays(mine.amount, list.filter((m) => m.days > 0)) : {};
      members = list
        .map((m) => ({ ...m, amount: split[m.id] ?? 0 }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    }
    qualityBank = {
      periodStart: bankRow.period_start,
      payoutDate: nextQualityBankPayoutDate(),
      pool,
      excludedWorst: QUALITY_BANK_EXCLUDED_WORST,
      teams: ranked.map((t) => ({
        rank: t.rank,
        name: t.name,
        mine: t.teamId === teamId,
        penalties: Math.round(t.penalties * 100) / 100,
        eligible: t.eligible,
        sharePct: Math.round(t.sharePct * 10) / 10,
        amount: t.amount,
      })),
      members,
    };
  }

  return NextResponse.json(
    {
      team: team?.name ?? "",
      year,
      month,
      hasRun: !!run?.id,
      updatedAt: new Date().toISOString(),
      employees: rows,
      qualityBank,
    },
    { headers: NO_STORE }
  );
}
