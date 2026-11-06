/**
 * SIMULATION INTERNE (juillet 2026) - JAMAIS un relevé d'heures.
 *
 * Montre, pour comprendre l'écart, à quoi ressembleraient les jours déjà saisis si leur total devait
 * égaler le total des bulletins de paie : l'écart est réparti à parts égales sur les jours réellement
 * saisis, en décalant l'heure de FIN (pas de 5 min, journée de 10 h maximum). Aucun jour n'est inventé :
 * ce qui ne peut pas être couvert est renvoyé dans `leftoverMinutes`.
 * Pure et en lecture seule : n'écrit rien dans la base.
 */

/** Total d'heures (h) des bulletins de juillet 2026, par "NOM Prénom" (en minuscules). Source : bulletins FITECO. */
export const JULY_2026_BULLETIN_HOURS: Record<string, number> = {
  "agatii alexandr": 191.67, "bezdrighin viorel": 166.67, "bogomaz nicolai": 191.67, "borets yevhen": 168.67,
  "cernisev artiom": 168.67, "chiriliuc mihail": 151.67, "cibotaru sergiu": 191.67, "cobzari serghei": 151.67,
  "cozodaev serghei": 151.67, "dandara ivan": 167.67, "drossu fiodor": 151.67, "dutca igor": 151.67,
  "fachira dmitri": 191.67, "filipov dumitru": 162.67, "garbuz nicolai": 191.67, "iliin evghenii": 151.67,
  "kotenko serhii": 186.67, "levciuc vasilii": 191.67, "mysko bohdan": 151.67, "nichiforeac roman": 162.67,
  "pogrebnoi anatolii": 162.67, "roponica dionis": 191.67, "sava nicolae": 191.67, "sitnic igor": 151.67,
  "starcicov andrei": 151.67, "suceveanu tudor": 162.67, "tsapko serhii": 151.67, "vetrici semion": 151.67,
  "zmeu nicolai": 151.67,
};

export type SimDayInput = {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM (fin saisie)
  pauseMinutes: number;
  totalMinutes: number;
};

export type SimDay = SimDayInput & {
  simEnd: string;
  simTotalMinutes: number;
  changeMinutes: number;
};

export type SimResult = {
  days: SimDay[];
  bulletinMinutes: number;
  recordedMinutes: number;
  simMinutes: number;
  /** > 0 : il manque des heures qu'aucun jour saisi ne peut absorber ; < 0 : heures en trop non réductibles. */
  leftoverMinutes: number;
};

const MAX_DAY = 600; // 10 h

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number): string {
  if (min >= 24 * 60) return "24:00+";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function simulateToBulletin(days: SimDayInput[], bulletinHours: number): SimResult {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  const recorded = sorted.reduce((s, d) => s + d.totalMinutes, 0);
  const bulletinMinutes = Math.round(bulletinHours * 60);
  const delta = bulletinMinutes - recorded;
  const adds = new Array<number>(n).fill(0);
  if (n > 0 && delta !== 0) {
    const sign = delta > 0 ? 1 : -1;
    let steps = Math.floor(Math.abs(delta) / 5);
    for (let i = 0, guard = 0; steps > 0 && guard < n * 130; i++, guard++) {
      const k = i % n;
      const t = sorted[k].totalMinutes + adds[k] + sign * 5;
      if (t > 0 && t <= MAX_DAY) {
        adds[k] += sign * 5;
        steps--;
      }
    }
    // reste < 5 min : on l'applique à un jour où c'est possible
    const rem = delta - adds.reduce((s, a) => s + a, 0);
    if (Math.abs(rem) < 5 && rem !== 0) {
      for (let k = 0; k < n; k++) {
        const t = sorted[k].totalMinutes + adds[k] + rem;
        if (t > 0 && t <= MAX_DAY) {
          adds[k] += rem;
          break;
        }
      }
    }
  }
  const out: SimDay[] = sorted.map((d, k) => ({
    ...d,
    simEnd: toHHMM(toMin(d.end) + adds[k]),
    simTotalMinutes: d.totalMinutes + adds[k],
    changeMinutes: adds[k],
  }));
  const sim = out.reduce((s, d) => s + d.simTotalMinutes, 0);
  return { days: out, bulletinMinutes, recordedMinutes: recorded, simMinutes: sim, leftoverMinutes: bulletinMinutes - sim };
}
