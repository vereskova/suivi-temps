/**
 * France's 11 public holidays (jours fériés) per calendar year — used to
 * suggest working-day counts and flag which holidays fall in a given month,
 * so RH can spot-check who might need "Maj. jours fériés" filled in.
 */

export type Holiday = { date: string; label: string };

const WEEKDAY_LABELS_FR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function easterMonthDay(year: number): { month: number; day: number } {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + delta);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function weekdayLabelFr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return WEEKDAY_LABELS_FR[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** A representative photo for each holiday in the Paie UI, served straight
 *  from Wikimedia Commons via Special:FilePath (a stable redirect to the
 *  current file, no need to know its internal upload path). Every file below
 *  was checked on Commons and carries a free license (CC-BY or public
 *  domain) — see each File: page for the photographer/attribution. */
function commonsFilePath(filename: string, width = 400): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}

export const FRENCH_HOLIDAY_IMAGE: Record<string, { url: string; credit: string }> = {
  "Jour de l'An": {
    url: commonsFilePath("Anjuna Beach, Goa, India, New Year's Eve, Fireworks in the sky, Night party.jpg"),
    credit: "Photo: Wikimedia Commons",
  },
  "Lundi de Pâques": {
    url: commonsFilePath("Decorated Easter eggs in basket, March 2008.jpg"),
    credit: "Photo: Wikimedia Commons",
  },
  "Fête du Travail": {
    url: commonsFilePath("Convallaria majalis-Muguet-Lily of the valley.jpg"),
    credit: "Photo: Wikimedia Commons",
  },
  "Victoire 1945": {
    url: commonsFilePath("Crowds of French patriots line the Champs Elysees-edit2.jpg"),
    credit: "Photo: US Army Signal Corps, via Wikimedia Commons (public domain)",
  },
  Ascension: {
    url: commonsFilePath(
      "Colorful clouds and blue sky with water reflection of an island hosting trees at sunrise in Si Phan Don, Laos.jpg"
    ),
    credit: "Photo: Wikimedia Commons",
  },
  "Lundi de Pentecôte": {
    url: commonsFilePath("Fire Radiance (Explored) - Flickr - Carol (vanhookc).jpg"),
    credit: "Photo: Carol (vanhookc), via Wikimedia Commons (CC-BY 2.0)",
  },
  "Fête nationale": {
    url: commonsFilePath("Eiffel Tower fireworks on Bastille Day 2017 (36303814541).jpg"),
    credit: "Photo: Kenneth Lu, via Wikimedia Commons (CC-BY 2.0)",
  },
  Assomption: {
    url: commonsFilePath("Notre Dame Paris front facade lower.jpg"),
    credit: "Photo: Wikimedia Commons",
  },
  Toussaint: {
    url: commonsFilePath("Yellow Chrysanthemum In Autumn - Flickr - aleksei86photo.jpg"),
    credit: "Photo: aleksei86photo, via Wikimedia Commons (CC-BY 2.0)",
  },
  Armistice: {
    url: commonsFilePath("Red Poppy Field.jpg"),
    credit: "Photo: Wikimedia Commons",
  },
  Noël: {
    url: commonsFilePath("Tree decorated with Christmas lights in Peddler's Village, Lahaska, Pennsylvania (2251714238).jpg"),
    credit: "Photo: Wikimedia Commons",
  },
};

export function frenchHolidaysForYear(year: number): Holiday[] {
  const easter = easterMonthDay(year);
  const easterMonday = addDays(year, easter.month, easter.day, 1);
  const ascension = addDays(year, easter.month, easter.day, 39);
  const whitMonday = addDays(year, easter.month, easter.day, 50);

  return [
    { date: iso(year, 1, 1), label: "Jour de l'An" },
    { date: iso(easterMonday.year, easterMonday.month, easterMonday.day), label: "Lundi de Pâques" },
    { date: iso(year, 5, 1), label: "Fête du Travail" },
    { date: iso(year, 5, 8), label: "Victoire 1945" },
    { date: iso(ascension.year, ascension.month, ascension.day), label: "Ascension" },
    { date: iso(whitMonday.year, whitMonday.month, whitMonday.day), label: "Lundi de Pentecôte" },
    { date: iso(year, 7, 14), label: "Fête nationale" },
    { date: iso(year, 8, 15), label: "Assomption" },
    { date: iso(year, 11, 1), label: "Toussaint" },
    { date: iso(year, 11, 11), label: "Armistice" },
    { date: iso(year, 12, 25), label: "Noël" },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function frenchHolidaysInMonth(year: number, month: number): Holiday[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return frenchHolidaysForYear(year).filter((h) => h.date.startsWith(prefix));
}

/** Weekdays (Mon–Fri) in the month. Public holidays are surfaced separately via
 *  frenchHolidaysInMonth() rather than subtracted here — whether a holiday
 *  reduces someone's actual working days depends on whether they were made to
 *  work it (tracked via "Maj. jours fériés"), not something this count assumes. */
export function countWorkingDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    count++;
  }
  return count;
}

/** Weekdays (Mon–Fri) between two ISO dates, inclusive on both ends. Used to
 *  prorate "jours repas" for someone who only worked part of the month (hired
 *  mid-month, went on leave, or was terminated) instead of assuming a full
 *  month. Returns 0 if the range is empty or inverted. */
export function countWeekdaysBetween(startIso: string, endIso: string): number {
  if (startIso > endIso) return 0;
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  let count = 0;
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    count++;
  }
  return count;
}
