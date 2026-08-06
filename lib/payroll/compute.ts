/**
 * Ports the net→brut reverse payroll calculation from VLADIS_с_итогом.xlsx
 * ("Расчёт ЗП" sheet). `netSouhaite` is a fixed target the accountant will
 * not adjust — every other line item is derived from it, in a waterfall:
 * base pay (days actually worked this month × the employee's own daily
 * rate) is subtracted first, then jours repas fills whatever gap is left
 * (capped by both the plan's max and by days worked — can't claim more meal
 * days than days present), then overtime at +25%, then +50%, then whatever
 * still isn't covered becomes prime exceptionnelle.
 *
 * Base pay falls back to the old fixed full-month calculation
 * (heuresNormalesMois × tauxHoraireBase) when either `joursTravailles` or
 * `salaireBaseNet` isn't provided for a line — this keeps rows computing
 * exactly as before until both new fields are actually filled in for them,
 * instead of silently collapsing to zero on rollout.
 *
 * Jours fériés worked are tracked in the Paie view (count only) but don't
 * feed this calculation — the accountant handles their pay separately.
 *
 * This produces the INPUT table handed to the accountant; it does not
 * generate an actual bulletin de paie.
 */

export type PayrollParams = {
  tauxHoraireBase: number;
  heuresNormalesMois: number;
  joursOuvresMoisStandard: number;
  /** Current net monthly SMIC, per the accountant — not derived from anything else, since no formula produces this correctly; update it directly whenever it changes. */
  smicNetMensuel: number;
  majorationHs25: number;
  majorationHs50: number;
  tauxRetenues: number;
  exonerationHsFixe: number;
  tarifRepasJour: number;
  maxJoursRepas: number;
  maxHs25Heures: number;
  maxHs50Heures: number;
};

export type PayrollInput = {
  netSouhaite: number;
  joursTravailles: number;
  /** The employee's own reference monthly net salary — null/0 until set on their profile. */
  salaireBaseNet: number | null;
};

export type PayrollResult = {
  /** The base pay portion actually used this run — day-based (joursTravailles × salaireBaseNet ÷ joursOuvresMoisStandard) once both inputs are filled, otherwise the old fixed full-month fallback. */
  baseNet: number;
  joursRepas: number;
  hs25Heures: number;
  hs50Heures: number;
  primeExceptionnelle: number;
};

export function computePayrollLine(input: PayrollInput, params: PayrollParams): PayrollResult {
  const netSouhaite = input.netSouhaite || 0;
  const joursTravailles = input.joursTravailles || 0;
  const salaireBaseNet = input.salaireBaseNet || 0;

  const {
    tauxHoraireBase: rate,
    heuresNormalesMois: normalHours,
    joursOuvresMoisStandard: joursOuvresStandard,
    majorationHs25: maj25,
    majorationHs50: maj50,
    tauxRetenues: retenues,
    exonerationHsFixe: exoneration,
    tarifRepasJour: tarifRepas,
    maxJoursRepas,
    maxHs25Heures: maxHs25,
    maxHs50Heures: maxHs50,
  } = params;

  const netUnit = 1 - retenues;

  const useJoursTravailles = joursTravailles > 0 && salaireBaseNet > 0;
  const baseNet = useJoursTravailles
    ? joursTravailles * (salaireBaseNet / joursOuvresStandard)
    : normalHours * rate * netUnit;
  const repasCap = useJoursTravailles ? Math.min(maxJoursRepas, joursTravailles) : maxJoursRepas;

  const remainderAfterBase = netSouhaite - baseNet - exoneration;
  const joursRepas = Math.min(
    repasCap,
    Math.max(0, Math.ceil(Math.max(0, remainderAfterBase) / tarifRepas))
  );
  const repasNet = joursRepas * tarifRepas;

  const remainderAfterRepas = remainderAfterBase - repasNet;
  const hs25Heures = Math.min(
    maxHs25,
    Math.max(0, Math.ceil(Math.max(0, remainderAfterRepas) / netUnit / (rate * (1 + maj25))))
  );

  const hs25Brut = hs25Heures * rate * (1 + maj25);
  const remainderAfterHs25 = remainderAfterRepas - hs25Brut * netUnit;
  const hs50Heures = Math.min(
    maxHs50,
    Math.max(0, Math.ceil(Math.max(0, remainderAfterHs25) / netUnit / (rate * (1 + maj50))))
  );

  const hs50Brut = hs50Heures * rate * (1 + maj50);
  const netUsedSoFar = baseNet + exoneration + repasNet + hs25Brut * netUnit + hs50Brut * netUnit;
  const primeExceptionnelle = Math.max(0, Math.round((netSouhaite - netUsedSoFar) * 100) / 100);

  return { baseNet, joursRepas, hs25Heures, hs50Heures, primeExceptionnelle };
}

export const DEFAULT_PAYROLL_PARAMS: PayrollParams = {
  tauxHoraireBase: 12.31,
  heuresNormalesMois: 151.67,
  joursOuvresMoisStandard: 21.67,
  smicNetMensuel: 1477.93,
  majorationHs25: 0.25,
  majorationHs50: 0.5,
  tauxRetenues: 0.2197,
  exonerationHsFixe: 72.4,
  tarifRepasJour: 30,
  maxJoursRepas: 22,
  maxHs25Heures: 32,
  maxHs50Heures: 8,
};
