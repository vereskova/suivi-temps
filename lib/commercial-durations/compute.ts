/**
 * Délais de pose — durée de chantier estimée à partir de la puissance (kWc)
 * ou d'une autre mesure (câble, surface...). Les normes elles-mêmes vivent
 * dans les tables `commercial_duration_norms` / `commercial_duration_norm_points`
 * (éditables depuis l'onglet "Normes" du module Commercial) plutôt qu'ici —
 * ce fichier ne fait que le calcul générique, pour que changer un chiffre
 * n'exige jamais un déploiement de code.
 */
import { frenchHolidaysForYear } from "@/lib/payroll/frenchHolidays";

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function isWeekend(iso: string): boolean {
  const dow = toUtcDate(iso).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Avance de `jours` jours OUVRÉS à partir de `startIso` (samedi/dimanche et
 *  jours fériés français ignorés) — les normes de la source sont en jours
 *  ouvrés, comme partout ailleurs dans l'appli (congés, planning...). */
export function addWorkingDays(startIso: string, jours: number): string {
  const wholeDays = Math.ceil(jours);
  const fromYear = Number(startIso.slice(0, 4));
  const holidays = new Set<string>();
  for (let y = fromYear; y <= fromYear + 2; y++) frenchHolidaysForYear(y).forEach((h) => holidays.add(h.date));

  let cur = startIso;
  let remaining = wholeDays;
  while (remaining > 0) {
    const d = toUtcDate(cur);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = toIso(d);
    if (!isWeekend(cur) && !holidays.has(cur)) remaining--;
  }
  return cur;
}

export type NormMode = "linear" | "step";
export type NormPoint = { x: number; y: number };
/** Une norme telle que chargée depuis `commercial_duration_norms`/`..._points`. */
export type NormDef = {
  mode: NormMode;
  points: NormPoint[]; // triées par x croissant
};

export type NormResult = { jours: number; extrapolated: boolean };

/** Interpolation linéaire entre les deux points encadrant `x` ; extrapole
 *  au-delà du dernier point connu (signalé côté UI). */
function evalLinear(points: NormPoint[], x: number): NormResult {
  const first = points[0];
  if (x <= first.x) {
    const second = points[1];
    const slope = (second.y - first.y) / (second.x - first.x);
    return { jours: Math.max(0, first.y + slope * (x - first.x)), extrapolated: x < first.x };
  }
  const last = points[points.length - 1];
  if (x >= last.x) {
    const prev = points[points.length - 2];
    const slope = (last.y - prev.y) / (last.x - prev.x);
    return { jours: last.y + slope * (x - last.x), extrapolated: x > last.x };
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return { jours: a.y + t * (b.y - a.y), extrapolated: false };
    }
  }
  return { jours: last.y, extrapolated: false };
}

/** Palier : chaque point est une borne haute de tranche ("x = 300 kWc" veut
 *  dire "de 0 (ou de la borne précédente) à 300"), sa valeur `y` s'applique
 *  telle quelle sur toute la tranche — pas d'interpolation entre paliers. */
function evalStep(points: NormPoint[], x: number): NormResult {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  for (const p of sorted) {
    if (x <= p.x) return { jours: p.y, extrapolated: false };
  }
  const last = sorted[sorted.length - 1];
  return { jours: last.y, extrapolated: true };
}

/** Point d'entrée unique pour toutes les normes de délais — `def` vient de
 *  la table éditable, `x` de la mesure du dossier (kWc, m, m²...). Une
 *  norme à un seul point (ex. "Pose Bac acier") est une constante, quelle
 *  que soit `x` — faute d'un deuxième point pour en déduire un taux. */
export function evalNorm(def: NormDef | undefined, x: number): NormResult {
  if (!def || def.points.length === 0) return { jours: 0, extrapolated: false };
  if (def.points.length === 1) return { jours: def.points[0].y, extrapolated: false };
  return def.mode === "step" ? evalStep(def.points, x) : evalLinear(def.points, x);
}
