/**
 * Délais de pose — durée de chantier estimée à partir de la puissance (kWc),
 * portée depuis "Normes travail sur les objets pour les équipes Delais.numbers".
 * Ces normes sont universelles (mêmes chiffres pour tous les clients) — voir
 * app/admin/page.tsx pour comment elles se rattachent aux lignes réelles de
 * la checklist ("Main-d'œuvre", "Tirage AC", "Pose SI"...), par correspondance
 * de libellé, sans jamais renommer ces libellés.
 *
 * Il n'y a pas de notion de "type de site" à choisir à la main : la checklist
 * du dossier dit elle-même si c'est une ombrière (présence d'une ligne
 * "Pose SI" / "Pose PPV"), auquel cas la courbe Main-d'œuvre "ombrière" (plus
 * élevée) s'applique au lieu de la courbe standard.
 *
 * "Depose Fibrociment" n'a aucune valeur en jours dans la source (case vide)
 * et n'a pas de ligne de checklist correspondante — volontairement absent.
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

type Bracket = [kwc: number, jours: number];

// Courbe "Main-d'œuvre" standard (la courbe "agricole" de la source,
// obsolète, a été remplacée par celle-ci — mêmes chiffres que "Advanced
// Energie / LT / Feedgy" — sur instruction de l'utilisatrice).
const MAIN_DOEUVRE_NORMS: Bracket[] = [
  [100, 6],
  [150, 8],
  [200, 10],
  [250, 12],
  [300, 14],
  [350, 16],
  [400, 18],
  [450, 20],
  [500, 22],
];

// Courbe "Main-d'œuvre" pour une ombrière (plus élevée, va jusqu'à 1000 kWc)
// — s'applique quand le dossier a aussi des lignes Pose SI/Pose PPV.
const OMBRIER_MAIN_DOEUVRE_NORMS: Bracket[] = [
  [100, 5],
  [200, 8],
  [300, 12],
  [400, 16],
  [500, 20],
  [600, 24],
  [700, 28],
  [800, 32],
  [900, 36],
  [1000, 40],
];

const OMBRIER_POSE_SI: Bracket[] = [
  [100, 1],
  [200, 1],
  [300, 1.5],
  [400, 2],
  [500, 2.5],
  [600, 3],
  [700, 3.5],
  [800, 4],
  [900, 5],
  [1000, 5],
];
const OMBRIER_POSE_PPV: Bracket[] = [
  [100, 1],
  [200, 1.5],
  [300, 2],
  [400, 2.5],
  [500, 3],
  [600, 3.5],
  [700, 4],
  [800, 5],
  [900, 7],
  [1000, 9],
];

/** Interpolation linéaire entre les deux paliers encadrant `x` ; extrapole
 *  au-delà du dernier palier connu (le résultat est alors signalé côté UI). */
function interpolate(brackets: Bracket[], x: number): { jours: number; extrapolated: boolean } {
  if (x <= brackets[0][0]) {
    const [x0, y0] = brackets[0];
    const [x1, y1] = brackets[1];
    const slope = (y1 - y0) / (x1 - x0);
    return { jours: Math.max(0, y0 + slope * (x - x0)), extrapolated: x < brackets[0][0] };
  }
  const last = brackets[brackets.length - 1];
  if (x >= last[0]) {
    const [xPrev, yPrev] = brackets[brackets.length - 2];
    const [xLast, yLast] = last;
    const slope = (yLast - yPrev) / (xLast - xPrev);
    return { jours: yLast + slope * (x - xLast), extrapolated: x > xLast };
  }
  for (let i = 0; i < brackets.length - 1; i++) {
    const [x0, y0] = brackets[i];
    const [x1, y1] = brackets[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return { jours: y0 + t * (y1 - y0), extrapolated: false };
    }
  }
  return { jours: last[1], extrapolated: false };
}

/** Tirage de câble : paliers discrets par tranche de longueur (pas de courbe continue dans la source). */
function tirageCableJours(m: number): number {
  if (m <= 100) return 1;
  if (m <= 200) return 2;
  return 3; // 200-400m dans la source ; au-delà, à vérifier manuellement
}

/** `ombriere` sélectionne la courbe "ombrière" — vrai dès que le dossier a des lignes Pose SI/Pose PPV. */
export function mainDOeuvreJours(powerKwc: number, ombriere = false) {
  return interpolate(ombriere ? OMBRIER_MAIN_DOEUVRE_NORMS : MAIN_DOEUVRE_NORMS, powerKwc);
}
export function poseSIJours(powerKwc: number) {
  return interpolate(OMBRIER_POSE_SI, powerKwc);
}
export function posePPVJours(powerKwc: number) {
  return interpolate(OMBRIER_POSE_PPV, powerKwc);
}
export function tirageCableJoursFor(m: number) {
  return { jours: tirageCableJours(m), extrapolated: m > 400 };
}

// Un seul point de mesure dans la source pour chacun de ces trois postes (pas
// de courbe possible) : "pose bac aciers" à 230m, "Dépose bac aciers" à
// 360m, "demontage panneaux" à 150 (unité non précisée dans la source) —
// chacun donne 1 jour. Faute d'un deuxième point pour en déduire un taux,
// la valeur s'applique telle quelle dès que la ligne existe, plutôt que
// d'inventer une mise à l'échelle non fondée sur la source.
export const POSE_BAC_ACIER_JOURS = 1;
export const DEPOSE_BAC_ACIER_JOURS = 1;
export const DEMONTAGE_PANNEAU_JOURS = 1;
