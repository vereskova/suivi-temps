/**
 * Ports the net→brut reverse payroll calculation from VLADIS_с_итогом.xlsx
 * ("Расчёт ЗП" sheet). Given a desired net-in-hand amount, it works out how
 * many overtime hours (at +25% then +50%) and how much exceptional bonus are
 * needed to reach it — in that order — after accounting for jours fériés
 * majoration and meal vouchers (repas), which are netted out first.
 *
 * This produces the INPUT table handed to the accountant; it does not
 * generate an actual bulletin de paie.
 */

export type PayrollParams = {
  tauxHoraireBase: number;
  heuresNormalesMois: number;
  majorationHs25: number;
  majorationHs50: number;
  tauxRetenues: number;
  exonerationHsFixe: number;
  tarifRepasJour: number;
  maxJoursRepas: number;
  maxHs25Heures: number;
  maxHs50Heures: number;
  /** % of one day's base pay suggested as a bonus for working a public holiday
   *  (RH enters the final amount by hand — this only drives the suggestion). */
  majorationJourFerie: number;
};

export type PayrollInput = {
  netSouhaite: number;
  majJoursFeries: number;
  joursRepas: number;
};

export type PayrollResult = {
  hs25Heures: number;
  hs50Heures: number;
  primeExceptionnelle: number;
};

export function computePayrollLine(input: PayrollInput, params: PayrollParams): PayrollResult {
  const netSouhaite = input.netSouhaite || 0;
  const majJoursFeries = input.majJoursFeries || 0;
  const joursRepas = input.joursRepas || 0;

  const {
    tauxHoraireBase: rate,
    heuresNormalesMois: normalHours,
    majorationHs25: maj25,
    majorationHs50: maj50,
    tauxRetenues: retenues,
    exonerationHsFixe: exoneration,
    tarifRepasJour: tarifRepas,
    maxHs25Heures: maxHs25,
    maxHs50Heures: maxHs50,
  } = params;

  const netUnit = 1 - retenues;
  const netAvantMajorations = netSouhaite - majJoursFeries * netUnit;
  const normalBrut = normalHours * rate;
  const normalNet = normalBrut * netUnit;
  const repasNet = joursRepas * tarifRepas;

  const remainderAfterRepas = netAvantMajorations - normalNet - repasNet - exoneration;
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
  const brutTotalNeeded = (netAvantMajorations - exoneration - repasNet) / netUnit;
  const primeExceptionnelle = Math.max(
    0,
    Math.round((brutTotalNeeded - normalBrut - hs25Brut - hs50Brut) * 100) / 100
  );

  return { hs25Heures, hs50Heures, primeExceptionnelle };
}

export const DEFAULT_PAYROLL_PARAMS: PayrollParams = {
  tauxHoraireBase: 12.31,
  heuresNormalesMois: 151.67,
  majorationHs25: 0.25,
  majorationHs50: 0.5,
  tauxRetenues: 0.2197,
  exonerationHsFixe: 72.4,
  tarifRepasJour: 30,
  maxJoursRepas: 22,
  maxHs25Heures: 32,
  maxHs50Heures: 8,
  majorationJourFerie: 1.0,
};
