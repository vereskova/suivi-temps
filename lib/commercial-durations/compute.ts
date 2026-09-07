/**
 * Délais de pose — durée de chantier estimée à partir de la puissance (kWc),
 * portée depuis "Normes travail sur les objets pour les équipes Delais.numbers".
 * Les paliers manquants dans la source (dépose/pose bac acier, démontage
 * panneaux, fibrociment) n'ont pas pu être lus fiablement dans l'export —
 * volontairement absents plutôt que devinés.
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

export type SiteTypeCode = "agricole" | "advanced_energie" | "ombrier";

export const SITE_TYPE_LABELS: Record<SiteTypeCode, { fr: string; ru: string }> = {
  agricole: { fr: "Agricole (horizon HML)", ru: "Agricole (horizon HML)" },
  advanced_energie: { fr: "Advanced Energie / LT / Feedgy", ru: "Advanced Energie / LT / Feedgy" },
  ombrier: { fr: "Ombrière", ru: "Навес (ombrière)" },
};

type Bracket = [kwc: number, jours: number];

const SITE_TYPE_NORMS: Record<SiteTypeCode, Bracket[]> = {
  // "agricole" utilise volontairement la même courbe que "advanced énergie /
  // LT / Feedgy" — la courbe propre à "agricol horizon HML" dans la source
  // est obsolète, remplacée par celle-ci sur instruction de l'utilisatrice.
  agricole: [
    [100, 6],
    [150, 8],
    [200, 10],
    [250, 12],
    [300, 14],
    [350, 16],
    [400, 18],
    [450, 20],
    [500, 22],
  ],
  advanced_energie: [
    [100, 6],
    [150, 8],
    [200, 10],
    [250, 12],
    [300, 14],
    [350, 16],
    [400, 18],
    [450, 20],
    [500, 22],
  ],
  ombrier: [
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
  ],
};

// Postes optionnels propres à l'ombrière — mêmes paliers de puissance que la
// courbe "ombrier" ci-dessus.
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

export type DurationAddons = {
  poseSI: boolean;
  posePPV: boolean;
  tirageCableM: number | null; // longueur de câble à tirer, en mètres
  setkaBacAcierM2: number | null; // grille sous bac acier à poser/déposer, en m²
  setkaPerimetreKwc: number | null; // grille de périmètre ombrière, sur la puissance en kWc
};

export const EMPTY_ADDONS: DurationAddons = {
  poseSI: false,
  posePPV: false,
  tirageCableM: null,
  setkaBacAcierM2: null,
  setkaPerimetreKwc: null,
};

export type DurationLineItem = { label: string; labelRu: string; jours: number; extrapolated: boolean };

export type DurationResult = {
  totalJours: number;
  extrapolated: boolean;
  lines: DurationLineItem[];
};

/** Tirage de câble : paliers discrets par tranche de longueur (pas de courbe continue dans la source). */
function tirageCableJours(m: number): number {
  if (m <= 100) return 1;
  if (m <= 200) return 2;
  return 3; // 200-400m dans la source ; au-delà, à vérifier manuellement
}
function setkaBacAcierJours(m2: number): number {
  return m2 <= 600 ? 1 : 2; // 0-600 / 600-1000 m² dans la source
}
function setkaPerimetreJours(kwc: number): number {
  return kwc <= 300 ? 1 : 2; // 0-300 / 300-500 kWc dans la source
}

/** Jours "Main-d'œuvre" seuls, sans les postes annexes — c'est cette valeur
 *  qui alimente à la fois la case "Fin souhaitée" du dossier et la ligne de
 *  checklist "Main-d'œuvre". */
export function mainDOeuvreJours(siteType: SiteTypeCode, powerKwc: number) {
  return interpolate(SITE_TYPE_NORMS[siteType], powerKwc);
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

export function computeDuration(siteType: SiteTypeCode, powerKwc: number, addons: DurationAddons): DurationResult {
  const base = interpolate(SITE_TYPE_NORMS[siteType], powerKwc);
  const lines: DurationLineItem[] = [
    {
      label: `${SITE_TYPE_LABELS[siteType].fr} — ${powerKwc} kWc`,
      labelRu: `${SITE_TYPE_LABELS[siteType].ru} — ${powerKwc} кВт`,
      jours: base.jours,
      extrapolated: base.extrapolated,
    },
  ];

  if (siteType === "ombrier" && addons.poseSI) {
    const r = interpolate(OMBRIER_POSE_SI, powerKwc);
    lines.push({ label: "Pose SI", labelRu: "Pose SI (монтаж системы)", jours: r.jours, extrapolated: r.extrapolated });
  }
  if (siteType === "ombrier" && addons.posePPV) {
    const r = interpolate(OMBRIER_POSE_PPV, powerKwc);
    lines.push({ label: "Pose PPV", labelRu: "Pose PPV (монтаж панелей)", jours: r.jours, extrapolated: r.extrapolated });
  }
  if (addons.tirageCableM) {
    lines.push({
      label: `Tirage de câble (${addons.tirageCableM} m)`,
      labelRu: `Протяжка кабеля (${addons.tirageCableM} м)`,
      jours: tirageCableJours(addons.tirageCableM),
      extrapolated: addons.tirageCableM > 400,
    });
  }
  if (addons.setkaBacAcierM2) {
    lines.push({
      label: `Grille sous bac acier (${addons.setkaBacAcierM2} m²)`,
      labelRu: `Сетка под bac acier (${addons.setkaBacAcierM2} м²)`,
      jours: setkaBacAcierJours(addons.setkaBacAcierM2),
      extrapolated: addons.setkaBacAcierM2 > 1000,
    });
  }
  if (addons.setkaPerimetreKwc) {
    lines.push({
      label: `Grille de périmètre (${addons.setkaPerimetreKwc} kWc)`,
      labelRu: `Сетка по периметру (${addons.setkaPerimetreKwc} кВт)`,
      jours: setkaPerimetreJours(addons.setkaPerimetreKwc),
      extrapolated: addons.setkaPerimetreKwc > 500,
    });
  }

  const totalJours = lines.reduce((s, l) => s + l.jours, 0);
  const extrapolated = lines.some((l) => l.extrapolated);
  return { totalJours, extrapolated, lines };
}
