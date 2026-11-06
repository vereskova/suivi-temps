/**
 * SIMULATION INTERNE (juillet 2026) - JAMAIS un relevé d'heures.
 *
 * Montre à quoi ressembleraient les jours déjà saisis si les heures supplémentaires, calculées à la semaine
 * comme l'explique M. Amaral (FITECO, 04/11/2026), devaient donner exactement les HS 25 % / HS 50 % du bulletin :
 * base mensualisée 151,67 h + HS 25 % de la 36e à la 43e heure de la semaine + HS 50 % à partir de la 44e ;
 * seules les semaines qui SE TERMINENT en juillet (29/06 -> 26/07) comptent pour juillet.
 *
 * Les jours réellement saisis sont conservés ; on décale l'heure de FIN (pas de 5 min, journée de 10 h max,
 * semaine de 48 h max). Aucun jour n'est inventé : ce qui ne peut pas être couvert est renvoyé en « reste ».
 * Pure et en lecture seule : n'écrit rien dans la base.
 */
import type { WeekRange } from "@/lib/payroll/weeklyOvertime";

/** HS payées sur les bulletins de juillet 2026 (heures), par "NOM Prénom" en minuscules. Source : bulletins FITECO. */
export const JULY_2026_BULLETIN_HS: Record<string, { hs25: number; hs50: number; other: number }> = {
  "cernisev artiom": { hs25: 17, hs50: 0, other: 0 },
  "cobzari serghei": { hs25: 0, hs50: 0, other: 0 },
  "dutca igor": { hs25: 0, hs50: 0, other: 0 },
  "filipov dumitru": { hs25: 11, hs50: 0, other: 0 },
  "iliin evghenii": { hs25: 0, hs50: 0, other: 0 },
  "levciuc vasilii": { hs25: 32, hs50: 8, other: 0 },
  "pogrebnoi anatolii": { hs25: 11, hs50: 0, other: 0 },
  "starcicov andrei": { hs25: 0, hs50: 0, other: 0 },
  "suceveanu tudor": { hs25: 11, hs50: 0, other: 0 },
  "vetrici semion": { hs25: 0, hs50: 0, other: 0 },
  "zmeu nicolai": { hs25: 0, hs50: 0, other: 0 },
  "agatii alexandr": { hs25: 32, hs50: 8, other: 0 },
  "bezdrighin viorel": { hs25: 15, hs50: 0, other: 0 },
  "bogomaz nicolai": { hs25: 32, hs50: 8, other: 0 },
  "borets yevhen": { hs25: 17, hs50: 0, other: 0 },
  "chiriliuc mihail": { hs25: 0, hs50: 0, other: 0 },
  "cibotaru sergiu": { hs25: 32, hs50: 8, other: 0 },
  "cozodaev serghei": { hs25: 0, hs50: 0, other: 0 },
  "dandara ivan": { hs25: 16, hs50: 0, other: 0 },
  "drossu fiodor": { hs25: 0, hs50: 0, other: 0 },
  "fachira dmitri": { hs25: 32, hs50: 8, other: 0 },
  "garbuz nicolai": { hs25: 32, hs50: 8, other: 0 },
  "kotenko serhii": { hs25: 32, hs50: 3, other: 0 },
  "mysko bohdan": { hs25: 0, hs50: 0, other: 0 },
  "nichiforeac roman": { hs25: 11, hs50: 0, other: 0 },
  "roponica dionis": { hs25: 32, hs50: 8, other: 0 },
  "sava nicolae": { hs25: 32, hs50: 8, other: 0 },
  "sitnic igor": { hs25: 0, hs50: 0, other: 0 },
  "tsapko serhii": { hs25: 0, hs50: 0, other: 0 },
};

export type SimDayInput = {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM (fin saisie)
  pauseMinutes: number;
  totalMinutes: number;
};

export type SimDay = SimDayInput & { simEnd: string; simTotalMinutes: number; changeMinutes: number };

export type SimWeek = {
  start: string;
  end: string;
  paidThisMonth: boolean;
  recordedMinutes: number;
  simMinutes: number;
  hs25Minutes: number;
  hs50Minutes: number;
  days: SimDay[];
};

export type SimResult = {
  weeks: SimWeek[];
  bulletinHs25Minutes: number;
  bulletinHs50Minutes: number;
  simHs25Minutes: number;
  simHs50Minutes: number;
  /** Minutes de HS du bulletin qu'aucune combinaison de jours saisis ne permet d'atteindre (>0), ou en trop (<0). */
  leftoverMinutes: number;
};

const T25 = 35 * 60; // la 36e heure démarre les 25 %
const T50 = 43 * 60; // la 44e heure démarre les 50 %
const WEEK_MAX = 48 * 60;
const DAY_MAX = 600; // 10 h

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number): string {
  if (min >= 24 * 60) return "24:00+";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Répartit `total` minutes entre des semaines en égalisant, sans dépasser le plafond de chacune. */
function waterFill(total: number, caps: number[]): number[] {
  const alloc = caps.map(() => 0);
  let remaining = total;
  let active = caps.map((_, i) => i);
  while (remaining > 0 && active.length > 0) {
    const share = Math.floor(remaining / active.length);
    if (share === 0) {
      for (const i of active) {
        if (remaining > 0 && alloc[i] < caps[i]) {
          alloc[i] += 1;
          remaining -= 1;
        }
      }
      break;
    }
    const next: number[] = [];
    for (const i of active) {
      const give = Math.min(share, caps[i] - alloc[i]);
      alloc[i] += give;
      remaining -= give;
      if (alloc[i] < caps[i]) next.push(i);
    }
    active = next;
  }
  return alloc;
}

/** Ajuste les totaux journaliers d'une semaine pour atteindre `target` minutes (pas de 5 min, 0 < jour <= 10 h). */
function distributeWeek(days: SimDayInput[], target: number): number[] {
  const n = days.length;
  const adds = new Array<number>(n).fill(0);
  if (n === 0) return adds;
  const delta = target - days.reduce((s, d) => s + d.totalMinutes, 0);
  if (delta === 0) return adds;
  const sign = delta > 0 ? 1 : -1;
  let steps = Math.floor(Math.abs(delta) / 5);
  for (let i = 0, guard = 0; steps > 0 && guard < n * 130; i++, guard++) {
    const k = i % n;
    const t = days[k].totalMinutes + adds[k] + sign * 5;
    if (t > 0 && t <= DAY_MAX) {
      adds[k] += sign * 5;
      steps--;
    }
  }
  const rem = delta - adds.reduce((s, a) => s + a, 0);
  if (Math.abs(rem) < 5 && rem !== 0) {
    for (let k = 0; k < n; k++) {
      const t = days[k].totalMinutes + adds[k] + rem;
      if (t > 0 && t <= DAY_MAX) {
        adds[k] += rem;
        break;
      }
    }
  }
  return adds;
}

export function simulateWeeklyToBulletin(
  allDays: SimDayInput[],
  weeks: WeekRange[],
  bulletin: { hs25: number; hs50: number }
): SimResult {
  const a = Math.round(bulletin.hs25 * 60);
  const b = Math.round(bulletin.hs50 * 60);
  const perWeek = weeks.map((w) =>
    allDays.filter((d) => d.date >= w.start && d.date <= w.end).sort((x, y) => x.date.localeCompare(y.date))
  );
  const recorded = perWeek.map((ds) => ds.reduce((s, d) => s + d.totalMinutes, 0));
  // semaines payées en juillet où l'on peut dépasser 35 h
  const maxOt = weeks.map((w, i) => (w.paidThisMonth && perWeek[i].length > 0 ? Math.max(0, Math.min(perWeek[i].length * DAY_MAX, WEEK_MAX) - T25) : 0));
  const eligible = weeks.map((_, i) => i).filter((i) => maxOt[i] > 0);
  const x = weeks.map(() => 0); // HS 25 % visées
  const y = weeks.map(() => 0); // HS 50 % visées

  if (eligible.length > 0 && (a > 0 || b > 0)) {
    const byCap = [...eligible].sort((i, j) => maxOt[j] - maxOt[i]);
    let chosen: number[] = [];
    if (b > 0) {
      for (let m = byCap.length; m >= 1; m--) {
        const top = byCap.slice(0, m);
        const yCap = top.map((i) => Math.max(0, Math.min(maxOt[i] - 480, WEEK_MAX - T50)));
        if (480 * m <= a && yCap.reduce((s, v) => s + v, 0) >= b) {
          chosen = top;
          const yAlloc = waterFill(b, yCap);
          top.forEach((i, k) => {
            y[i] = yAlloc[k];
            x[i] = 480;
          });
          break;
        }
      }
      if (chosen.length === 0) {
        // impossible exactement : on remplit au mieux
        const yCap = byCap.map((i) => Math.max(0, Math.min(maxOt[i] - 480, WEEK_MAX - T50)));
        const yAlloc = waterFill(b, yCap);
        byCap.forEach((i, k) => {
          if (yAlloc[k] > 0) {
            y[i] = yAlloc[k];
            x[i] = 480;
            chosen.push(i);
          }
        });
      }
    }
    const others = eligible.filter((i) => !chosen.includes(i));
    const xLeft = Math.max(0, a - x.reduce((s, v) => s + v, 0));
    if (xLeft > 0 && others.length > 0) {
      const xAlloc = waterFill(xLeft, others.map((i) => Math.min(480, maxOt[i])));
      others.forEach((i, k) => {
        x[i] = xAlloc[k];
      });
    }
  }

  const simWeeks: SimWeek[] = weeks.map((w, i) => {
    const ds = perWeek[i];
    let target = recorded[i];
    if (w.paidThisMonth && ds.length > 0) {
      target = x[i] + y[i] > 0 ? T25 + x[i] + y[i] : Math.min(recorded[i], T25);
    }
    const adds = w.paidThisMonth ? distributeWeek(ds, target) : ds.map(() => 0);
    const days: SimDay[] = ds.map((d, k) => ({
      ...d,
      simEnd: toHHMM(toMin(d.end) + adds[k]),
      simTotalMinutes: d.totalMinutes + adds[k],
      changeMinutes: adds[k],
    }));
    const simMinutes = days.reduce((s, d) => s + d.simTotalMinutes, 0);
    return {
      start: w.start,
      end: w.end,
      paidThisMonth: w.paidThisMonth,
      recordedMinutes: recorded[i],
      simMinutes,
      hs25Minutes: w.paidThisMonth ? Math.max(0, Math.min(simMinutes, T50) - T25) : 0,
      hs50Minutes: w.paidThisMonth ? Math.max(0, simMinutes - T50) : 0,
      days,
    };
  });
  const simHs25 = simWeeks.reduce((s, w) => s + w.hs25Minutes, 0);
  const simHs50 = simWeeks.reduce((s, w) => s + w.hs50Minutes, 0);
  return {
    weeks: simWeeks,
    bulletinHs25Minutes: a,
    bulletinHs50Minutes: b,
    simHs25Minutes: simHs25,
    simHs50Minutes: simHs50,
    leftoverMinutes: a + b - simHs25 - simHs50,
  };
}
