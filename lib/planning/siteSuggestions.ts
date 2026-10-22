import type { PlanningJob } from "./parsePlanning";

// Названия объектов (chantiers) из планинга по номеру команды - подсказки для выбора
// штрафов контролёра (колонка « Штраф » в Primes & Bonus). Планинг заполняется вручную
// для просмотра глазами, поэтому текст в ячейках « неровный » (имя рабочего, адрес,
// « дорога », визит к врачу…) : отсеиваем очевидный мусор и отдаём ТОЛЬКО подсказки -
// человек всегда может ввести объект сам.

const NOISE =
  /(visite|medical|команд|дорог|livraison|client|в ожидании|bac acier|^\W*$|^\d+([.,]\d+)?$|^÷$|\b\d{5}\b|^c \d)/i;
const SINGLE_FIRST_NAME = /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/; // « Javier », « Franck »…
const FIRST_AND_LAST = /^[A-ZÀ-Ý][a-zà-ÿ'-]+ [A-ZÀ-Ý'-]{2,}$/; // « Richard CHAULET »

const ADDRESS_WORD = /\b(rue|route|rte|chemin|avenue|lieu[- ]?dit|impasse|all[ée]e|zone|za)\b/i;

export function cleanSite(raw: string): string | null {
  let v = raw
    .replace(/\s+/g, " ")
    .replace(/\s+-?\d{1,3}\.\d{4,}\s+-?\d{1,3}\.\d{4,}\s*$/, "") // GPS en fin de ligne
    .trim();
  // « OPTIM23-17 21 RUE DES SOURCES » → « OPTIM23-17 » : on garde le nom, on coupe l'adresse.
  const withAddress = v.match(/^(.*?)\s+\d{1,3}\s*(?:bis\s+)?(?:rue|route|rte|chemin|avenue|impasse|all[ée]e)\b/i);
  if (withAddress) v = withAddress[1].trim();
  if (v.length < 3 || v.length > 70) return null;
  if (/^[a-zà-ÿ]/.test(v) || /[°"]/.test(v) || /^\d{1,3}\.\d+/.test(v)) return null; // « rives et faîtages », coordonnées
  if (NOISE.test(v) || ADDRESS_WORD.test(v) || SINGLE_FIRST_NAME.test(v) || FIRST_AND_LAST.test(v)) return null;
  return v;
}

/** Номер команды (« 5 ») → названия объектов за окно [from, to] (ISO), самые свежие первыми. */
export function siteSuggestionsByTeam(jobs: PlanningJob[], from: string, to: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const inWindow = jobs
    .filter((j) => /^\d+$/.test(j.team) && j.dateFromIso && j.dateToIso && j.dateToIso >= from && j.dateFromIso <= to)
    .sort((a, b) => (b.dateFromIso ?? "").localeCompare(a.dateFromIso ?? ""));
  for (const j of inWindow) {
    const list = (out[j.team] ??= []);
    for (const raw of [j.worker, j.site, ...j.notes]) {
      const s = raw ? cleanSite(raw) : null;
      if (s && !list.some((x) => x.toLowerCase() === s.toLowerCase())) list.push(s);
    }
  }
  return out;
}
