/**
 * Банк качества (entreprise) - répartition PAR ÉQUIPE (décision 21/10/2026).
 *
 * Le pool se remplit avec 75 % des pénalités des équipes chantier (voir
 * computeControllerSplit dans compute.ts), SANS plafond, jusqu'à la prochaine
 * date de paiement : fin janvier et fin septembre. Les équipes sont classées
 * par total de pénalités sur la période (moins = mieux ; à égalité, plus de
 * BONUS équipe d'abord). Les TROIS pires équipes sont exclues ; les autres se
 * partagent le pool par rang : avec k équipes dans le classement, la meilleure
 * reçoit k parts, la suivante k−1, …, la dernière 1. La part d'une équipe est
 * ensuite répartie entre ses membres au prorata des jours travaillés dans la
 * période. Après le paiement, le pool repart de zéro.
 */

export const QUALITY_BANK_EXCLUDED_WORST = 3;
/** Mois où le Банк качества est payé (fin de mois) : janvier et septembre. */
export const QUALITY_BANK_PAYOUT_MONTHS = [1, 9];

export type TeamStanding = {
  teamId: string;
  name: string;
  /** Somme des pénalités (valeur positive) de l'équipe sur la période. */
  penalties: number;
  /** Somme du BONUS équipe de la période (départage les égalités). */
  bonus: number;
};

export type RankedTeam = TeamStanding & {
  rank: number;
  /** false = dans les trois pires : pas de part. */
  eligible: boolean;
  weight: number;
  sharePct: number;
  amount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function rankTeamsForQualityBank(teams: TeamStanding[], pool: number): RankedTeam[] {
  const sorted = [...teams].sort(
    (a, b) =>
      a.penalties - b.penalties ||
      b.bonus - a.bonus ||
      a.name.localeCompare(b.name, undefined, { numeric: true })
  );
  const eligibleCount = Math.max(0, sorted.length - QUALITY_BANK_EXCLUDED_WORST);
  const totalWeight = (eligibleCount * (eligibleCount + 1)) / 2;
  const safePool = Math.max(0, pool);
  return sorted.map((t, i) => {
    const eligible = i < eligibleCount;
    const weight = eligible ? eligibleCount - i : 0;
    return {
      ...t,
      rank: i + 1,
      eligible,
      weight,
      sharePct: totalWeight > 0 ? (weight / totalWeight) * 100 : 0,
      amount: totalWeight > 0 ? round2((safePool * weight) / totalWeight) : 0,
    };
  });
}

/**
 * Répartit `amount` entre les membres au prorata de `days`. Si personne n'a de
 * jours, partage égal. Le reliquat d'arrondi va au membre qui a le plus de jours,
 * pour que la somme tombe exactement sur `amount`.
 */
export function splitByDays(amount: number, members: { id: string; days: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (members.length === 0) return out;
  const totalDays = members.reduce((s, m) => s + Math.max(0, m.days), 0);
  const weights = members.map((m) => (totalDays > 0 ? Math.max(0, m.days) / totalDays : 1 / members.length));
  members.forEach((m, i) => {
    out[m.id] = round2(amount * weights[i]);
  });
  const distributed = Object.values(out).reduce((s, v) => s + v, 0);
  const remainder = round2(amount - distributed);
  if (Math.abs(remainder) >= 0.01) {
    let topIndex = 0;
    weights.forEach((w, i) => {
      if (w > weights[topIndex]) topIndex = i;
    });
    const topId = members[topIndex].id;
    out[topId] = round2(out[topId] + remainder);
  }
  return out;
}

/** Prochaine date de paiement (fin janvier ou fin septembre) à partir d'aujourd'hui, au format AAAA-MM-JJ. */
export function nextQualityBankPayoutDate(today: Date = new Date()): string {
  const y = today.getUTCFullYear();
  const iso = (year: number, month: number, day: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const todayIso = iso(y, today.getUTCMonth() + 1, today.getUTCDate());
  const candidates = [iso(y, 1, 31), iso(y, 9, 30), iso(y + 1, 1, 31)];
  return candidates.find((c) => c >= todayIso) ?? candidates[candidates.length - 1];
}

/** Premier jour du mois qui suit un paiement effectué dans le mois (year, month 1-12). */
export function periodStartAfterPayout(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

// ───────── Changements d'équipe en cours de période ─────────
// Une personne peut passer d'une équipe à une autre pendant la période. On suit
// l'équipe réellement travaillée (pointage_entries.team_id, jour par jour) :
//  • ses pénalités et son BONUS d'un mois sont répartis entre les équipes au
//    prorata de ses jours dans chacune ce mois-là (sans pointage : équipe actuelle) ;
//  • sa part de la prime d'une équipe est calculée sur ses jours DANS cette équipe ;
//  • seuls les salariés encore présents à la date de paiement touchent la prime.

export type PeriodLine = { employeeId: string; month: string; penalty: number; bonus: number };
/** Jours travaillés (1 / 0,5) d'un salarié dans une équipe, pour un mois AAAA-MM. */
export type TeamDayRow = { employeeId: string; teamId: string; month: string; days: number };

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Additionne des jours par (salarié, équipe, mois) à partir de lignes de pointage brutes. */
export function aggregateTeamDays(
  rows: { employee_id: string; team_id: string; work_date: string; is_absent: boolean; half_day: boolean | null }[]
): TeamDayRow[] {
  const acc = new Map<string, TeamDayRow>();
  rows.forEach((r) => {
    if (r.is_absent) return;
    const month = monthKey(r.work_date);
    const key = `${r.employee_id}|${r.team_id}|${month}`;
    const cur = acc.get(key) ?? { employeeId: r.employee_id, teamId: r.team_id, month, days: 0 };
    cur.days += r.half_day ? 0.5 : 1;
    acc.set(key, cur);
  });
  return Array.from(acc.values());
}

/** Répartit pénalités et BONUS de chaque (salarié, mois) entre les équipes selon ses jours du mois. */
export function allocatePenaltiesToTeams(
  lines: PeriodLine[],
  dayRows: TeamDayRow[],
  currentTeamOf: (employeeId: string) => string | null
): Map<string, { penalties: number; bonus: number }> {
  const daysBy = new Map<string, TeamDayRow[]>();
  dayRows.forEach((d) => {
    const key = `${d.employeeId}|${d.month}`;
    daysBy.set(key, [...(daysBy.get(key) ?? []), d]);
  });
  const out = new Map<string, { penalties: number; bonus: number }>();
  const add = (teamId: string, penalty: number, bonus: number) => {
    const cur = out.get(teamId) ?? { penalties: 0, bonus: 0 };
    cur.penalties += penalty;
    cur.bonus += bonus;
    out.set(teamId, cur);
  };
  lines.forEach((l) => {
    const days = (daysBy.get(`${l.employeeId}|${l.month}`) ?? []).filter((d) => d.days > 0);
    const total = days.reduce((s, d) => s + d.days, 0);
    if (total > 0) {
      days.forEach((d) => add(d.teamId, (l.penalty * d.days) / total, (l.bonus * d.days) / total));
    } else {
      const team = currentTeamOf(l.employeeId);
      if (team) add(team, l.penalty, l.bonus);
    }
  });
  return out;
}

/** Jours d'un salarié dans une équipe sur toute la période. */
export function daysInTeam(dayRows: TeamDayRow[], teamId: string): Map<string, number> {
  const out = new Map<string, number>();
  dayRows.forEach((d) => {
    if (d.teamId !== teamId) return;
    out.set(d.employeeId, (out.get(d.employeeId) ?? 0) + d.days);
  });
  return out;
}

/** Lit toutes les pages d'une requête Supabase (limite de 1000 lignes par appel). */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = await page(from, from + pageSize - 1);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
