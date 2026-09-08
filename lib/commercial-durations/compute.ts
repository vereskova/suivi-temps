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

export type NormMode = "linear" | "step_ceil" | "step_floor";
export type NormPoint = { x: number; y: number };
/** Une norme telle que chargée depuis `commercial_duration_norms`/`..._points`. */
export type NormDef = {
  mode: NormMode;
  points: NormPoint[]; // triées par x croissant
};

export type NormResult = { jours: number; extrapolated: boolean };

/** Interpolation linéaire entre les deux points encadrant `x` ; extrapole
 *  au-delà du dernier point connu (signalé côté UI). Non utilisé par les
 *  normes actuelles (toutes en paliers fixes) — gardé si besoin un jour
 *  d'une vraie courbe continue. */
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

/** Palier "borne haute" : chaque point est la fin de sa tranche ("x = 300"
 *  veut dire "de la borne précédente jusqu'à 300 inclus"), sa valeur `y`
 *  s'applique telle quelle — aucune interpolation. C'est la lecture
 *  naturelle d'une norme écrite comme une plage explicite dans la source
 *  ("0-300 kWc → 1 jour, 300-500 kWc → 2 jours") : 350 tombe dans la
 *  tranche "300-500" donc vaut 2, fixe. */
function evalStepCeil(points: NormPoint[], x: number): NormResult {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  for (const p of sorted) {
    if (x <= p.x) return { jours: p.y, extrapolated: false };
  }
  const last = sorted[sorted.length - 1];
  return { jours: last.y, extrapolated: true };
}

/** Palier "borne basse" : chaque point est le SEUIL à partir duquel sa
 *  valeur s'applique, jusqu'au seuil suivant — aucune interpolation. C'est
 *  la lecture naturelle d'une norme écrite comme une liste de paliers bruts
 *  ("100 → 6 jours, 150 → 8 jours, 200 → 10 jours...") : 170 n'a pas encore
 *  atteint le palier 200, donc reste au palier 150, fixe à 8. */
function evalStepFloor(points: NormPoint[], x: number): NormResult {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  let current = sorted[0];
  for (const p of sorted) {
    if (p.x <= x) current = p;
    else break;
  }
  const extrapolated = x < sorted[0].x || x > sorted[sorted.length - 1].x;
  return { jours: current.y, extrapolated };
}

/** Point d'entrée unique pour toutes les normes de délais — `def` vient de
 *  la table éditable, `x` de la mesure du dossier (kWc, m, m²...). Une
 *  norme à un seul point (ex. "Pose Bac acier") est une constante, quelle
 *  que soit `x` — faute d'un deuxième point pour en déduire un taux. */
export function evalNorm(def: NormDef | undefined, x: number): NormResult {
  if (!def || def.points.length === 0) return { jours: 0, extrapolated: false };
  if (def.points.length === 1) return { jours: def.points[0].y, extrapolated: false };
  if (def.mode === "step_ceil") return evalStepCeil(def.points, x);
  if (def.mode === "step_floor") return evalStepFloor(def.points, x);
  return evalLinear(def.points, x);
}
