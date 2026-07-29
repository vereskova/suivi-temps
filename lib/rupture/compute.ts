/**
 * Rupture-de-contrat calculator — préavis, procédure de rupture conventionnelle
 * (RC), and indemnités, per la Convention Collective Métallurgie. Ported field
 * for field from the reference spreadsheet (Calculateur_Ruptures.xlsx) so the
 * numbers match exactly; only the input/output shapes are new.
 */
import { frenchHolidaysForYear } from "@/lib/payroll/frenchHolidays";

export type RuptureType = "RC" | "Démission" | "Licenciement";

export type RuptureInput = {
  hireDate: string | null; // ISO
  group: string; // "A".."I"
  age: number | null;
  monthlyGrossSalary: number | null;
  cpBalanceDays: number | null;
  ruptureType: RuptureType;
  desiredRuptureDate: string | null; // ISO
  dispensePreavis: boolean;
};

export type RcTimeline = {
  convocationDeadline: string;
  entretienSignatureDeadline: string;
  finRetractation: string;
  depotDreets: string;
  debutInstruction: string;
  validationTacite: string;
  ruptureEffective: string;
};

export type RuptureResult = {
  ancienneteYears: number;
  ancienneteMonths: number;
  ancienneteDecimalYears: number;
  preavisDays: number | null;
  notificationDate: string | null;
  rc: RcTimeline | null;
  indemniteRuptureOuLicenciement: number;
  indemniteCP: number;
  indemnitePreavisCompensatoire: number;
  total: number;
};

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

function isWeekend(iso: string): boolean {
  const dow = toUtcDate(iso).getUTCDay();
  return dow === 0 || dow === 6;
}

function holidaySetForRange(fromIso: string, toIsoDate: string): Set<string> {
  const fromYear = Number(fromIso.slice(0, 4));
  const toYear = Number(toIsoDate.slice(0, 4));
  const set = new Set<string>();
  for (let y = fromYear - 1; y <= toYear + 1; y++) {
    frenchHolidaysForYear(y).forEach((h) => set.add(h.date));
  }
  return set;
}

/** Excel WORKDAY() equivalent — moves `delta` business days from `iso`,
 *  skipping weekends and the given holidays. Negative `delta` moves backward. */
function workday(iso: string, delta: number, holidays: Set<string>): string {
  let cur = iso;
  const step = delta >= 0 ? 1 : -1;
  let remaining = Math.abs(delta);
  while (remaining > 0) {
    cur = addCalendarDays(cur, step);
    if (!isWeekend(cur) && !holidays.has(cur)) {
      remaining--;
    }
  }
  return cur;
}

/** Anniversary-based seniority — mirrors Excel's DATEDIF(hire, ref, "Y"/"M"). */
function anciennete(hireIso: string, refIso: string): { years: number; months: number; decimalYears: number } {
  const hire = toUtcDate(hireIso);
  const ref = toUtcDate(refIso);
  let years = ref.getUTCFullYear() - hire.getUTCFullYear();
  let months = ref.getUTCMonth() - hire.getUTCMonth();
  const days = ref.getUTCDate() - hire.getUTCDate();
  if (days < 0) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) {
    years = 0;
    months = 0;
  }
  return { years, months, decimalYears: years + months / 12 };
}

/** Calendar-day notice period, per group/seniority/age — ported verbatim from
 *  the reference spreadsheet's formula (Convention Collective Métallurgie). */
function preavisCalendarDays(
  type: RuptureType,
  group: string,
  decimalYears: number,
  age: number | null
): number | null {
  if (type === "RC") return 0;

  const isAB = group === "A" || group === "B";
  const isC = group === "C";
  const isD = group === "D";
  const isE = group === "E";
  const isFGHI = group === "F" || group === "G" || group === "H" || group === "I";

  if (type === "Démission") {
    if (isAB) return 14;
    if (isC) return 30;
    if (isD || isE) return 60;
    if (isFGHI) return 90;
    return null;
  }

  // Licenciement
  if (isAB) return decimalYears < 2 ? 30 : 60;
  if (isC) return decimalYears < 2 ? 30 : 60;
  if (isD) return decimalYears < 2 ? 30 : 60;
  if (isE) return decimalYears < 2 ? 30 : decimalYears >= 3 ? 90 : 60;
  if (isFGHI) {
    if (decimalYears < 2) return 30;
    if (decimalYears < 3) return 60;
    if (decimalYears >= 5 && age !== null && age >= 50 && age < 56) return 180;
    if (decimalYears >= 3) {
      if (age === null) return null; // age is required to resolve this bracket
      if (age < 50) return 90;
      if (age < 56) return 120;
      return 180;
    }
    return 60;
  }
  return null;
}

function rcTimeline(desiredRuptureIso: string, holidays: Set<string>): RcTimeline {
  const depotDreets = workday(addCalendarDays(desiredRuptureIso, -1), -15, holidays);
  const finRetractation = addCalendarDays(depotDreets, -1);
  const debutInstruction = addCalendarDays(depotDreets, 1);
  const validationTacite = addCalendarDays(desiredRuptureIso, -1);
  const entretienSignatureDeadline = workday(addCalendarDays(depotDreets, -15), -1, holidays);
  const convocationDeadline = workday(entretienSignatureDeadline, -5, holidays);
  return {
    convocationDeadline,
    entretienSignatureDeadline,
    finRetractation,
    depotDreets,
    debutInstruction,
    validationTacite,
    ruptureEffective: desiredRuptureIso,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function indemniteRuptureOuLicenciement(
  type: RuptureType,
  decimalYears: number,
  monthlySalary: number | null
): number {
  if (type !== "RC" && type !== "Licenciement") return 0;
  if (!monthlySalary || decimalYears < 1) return 0;
  const amount =
    decimalYears <= 10 ? (monthlySalary / 4) * decimalYears : (monthlySalary / 4) * 10 + (monthlySalary / 3) * (decimalYears - 10);
  return round2(amount);
}

function indemniteCP(monthlySalary: number | null, cpDays: number | null): number {
  if (!monthlySalary || !cpDays || cpDays <= 0) return 0;
  return round2((monthlySalary / 21.67) * cpDays);
}

function indemnitePreavisCompensatoire(
  dispense: boolean,
  preavisDays: number | null,
  monthlySalary: number | null
): number {
  if (!dispense || !preavisDays || preavisDays <= 0 || !monthlySalary) return 0;
  return round2((monthlySalary * preavisDays) / 30.44);
}

export function computeRupture(input: RuptureInput): RuptureResult | null {
  if (!input.hireDate || !input.desiredRuptureDate) return null;

  const { years, months, decimalYears } = anciennete(input.hireDate, input.desiredRuptureDate);
  const preavisDays = preavisCalendarDays(input.ruptureType, input.group, decimalYears, input.age);
  const notificationDate =
    input.ruptureType === "RC" || preavisDays === null
      ? null
      : addCalendarDays(input.desiredRuptureDate, -preavisDays);

  const holidays = holidaySetForRange(input.hireDate, input.desiredRuptureDate);
  const rc = input.ruptureType === "RC" ? rcTimeline(input.desiredRuptureDate, holidays) : null;

  const indemRupture = indemniteRuptureOuLicenciement(input.ruptureType, decimalYears, input.monthlyGrossSalary);
  const indemCP = indemniteCP(input.monthlyGrossSalary, input.cpBalanceDays);
  const indemPreavis = indemnitePreavisCompensatoire(input.dispensePreavis, preavisDays, input.monthlyGrossSalary);
  const total = input.ruptureType === "Démission" ? indemCP : round2(indemRupture + indemCP + indemPreavis);

  return {
    ancienneteYears: years,
    ancienneteMonths: months,
    ancienneteDecimalYears: decimalYears,
    preavisDays,
    notificationDate,
    rc,
    indemniteRuptureOuLicenciement: indemRupture,
    indemniteCP: indemCP,
    indemnitePreavisCompensatoire: indemPreavis,
    total,
  };
}
