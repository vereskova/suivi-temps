import type { PlanningJob } from "./parsePlanning";

// Названия объектов (chantiers) из планинга - подсказки и список объектов для экрана контролёра.
// Планинг заполняется вручную для просмотра глазами, поэтому в ячейках блока вперемешку лежат :
//   · имя рабочего (« Franck », « Remi LEFEVE », « NANDILLON Jérémy ») - первые два фрагмента блока
//     часто « рабочий + объект » в любом порядке;
//   · объект (« Delmon 82-6002 », « 62-GEN-DEGEUSER », « LAGRANGE 12699 », « BREUILLAULT »);
//   · адрес владельца (« LIEU-DIT GAILLOU 82120 VAZERAC », « 600 CHEMIN DES AGRIES, 31860,… »);
//   · клиент (« SARL … », « SCEA DEGEUSER ») - не название объекта;
//   · заметки (« Livraison », « Benne !!! », « 51 panneaux », « 203,84 kWc rétrofit », « Visite medicale… »,
//     русский текст, GPS-координаты).
// Правило : объекты берём из первых двух фрагментов блока (минус имена рабочих); из остальных заметок -
// только то, что точно похоже на объект (код проекта вроде « 31-7346 » / « 24-GEN-X », торговая сеть,
// « Collège… »). Человек всегда может ввести объект сам.

const FIRST_NAME_ONLY = /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/; // « Javier », « Franck »
const FIRST_LAST = /^[A-ZÀ-Ý][a-zà-ÿ'-]+ [A-ZÀ-Ý'-]{2,}$/; // « Remi LEFEVE »
const LAST_FIRST = /^[A-ZÀ-Ý'-]{3,} [A-ZÀ-Ý][a-zà-ÿ'-]+$/; // « NANDILLON Jérémy »
const ADDRESS_WORD = /\b(rue|route|rte|chemin|chem|che|avenue|ave|av|lieu[- ]?dit|ld|impasse|all[ée]e|zone|za|boulevard|bd|place|ferme)\b\.?/i;
const POSTAL = /(,\s*\d{5}\b|\(\d{5}\)|\b\d{5}\s+[A-ZÀ-Ý])/; // « , 31860 », « (31200) », « 82120 VAZERAC »
const STARTS_WITH_NUMBER_WORD = /^\d{1,4}\s*(bis\s+)?[A-Za-zÀ-ÿ]/; // « 600 CHEMIN … », « 21 Rue … »
const CLIENT = /^(sarl|scea|earl|gaec|sas|sci|eurl|ets|mr|mme)\b/i;
const NOISE =
  /(visite|medical|команд|дорог|livraison|client|в ожидании|bac acier|ppv\b|photo|filet|benne|panneaux|bracons|chariot|manitou|instal|remplacement|raccordement|rives|fa[iî]tages|devis|^\W*$|^\d+([.,]\d+)?$|^÷$|^c \d|kwc|\bkw\b|\bkwh\b|[!°"])/i;
const CODE = /(\d{2}-(GEN|STO)-|\b\d{2,3}-\d{4}\b|[A-Z]+-?\d+-\d+|\b\d{4,5}$)/; // код проекта
const BRAND = /(^|[^A-Za-zÀ-ÿ])(intermarch[ée]|leclerc|botanic|carrefour|lidl|auchan|coll[èe]ge|lyc[ée]e|[ée]cole|mairie|emmaus|casino|super u)(?![A-Za-zÀ-ÿ])/i;
const CYRILLIC = /[А-Яа-яЁё]/;

/** Чистка одного фрагмента : название или null (мусор / имя рабочего / адрес / клиент). */
export function cleanSite(raw: string): string | null {
  let v = raw
    .normalize("NFC") // « é » из Mac бывает « e + ́ »
    .replace(/\s+/g, " ")
    .replace(/\s+-?\d{1,3}\.\d{4,}\s+-?\d{1,3}\.\d{4,}\s*$/, "") // GPS в конце строки
    .trim();
  // « OPTIM23-16 21 RUE DES SOURCES » → « OPTIM23-16 » : оставляем имя, режем адрес.
  const withAddress = v.match(/^(.*?)\s+\d{1,3}\s*(?:bis\s+)?(?:rue|route|rte|chemin|avenue|impasse|all[ée]e)\b/i);
  if (withAddress) v = withAddress[1].trim();
  // « OPTIM-23-13 - 7 Rue Haute… » → « OPTIM-23-13 »
  v = v.replace(/\s*[-–]\s*\d{1,3}\s+(?:rue|route|rte|chemin|avenue|impasse|all[ée]e)\b.*$/i, "").replace(/\s*[-–]+\s*$/, "").trim();
  if (v.length < 3 || v.length > 70) return null;
  if (CYRILLIC.test(v)) return null;
  if (/^[a-zà-ÿ]/.test(v) || /^\d{1,3}\.\d+/.test(v)) return null; // « rives et faîtages », координаты
  if (NOISE.test(v)) return null;
  if (CLIENT.test(v)) return null;
  if (STARTS_WITH_NUMBER_WORD.test(v) || POSTAL.test(v)) return null;
  if (ADDRESS_WORD.test(v) && !BRAND.test(v)) return null;
  if (FIRST_NAME_ONLY.test(v) || FIRST_LAST.test(v) || LAST_FIRST.test(v)) return null;
  return v;
}

/** Объекты одного блока планинга : первые два фрагмента (рабочий/объект в любом порядке) + « уверенные » заметки. */
export function sitesOfJob(j: Pick<PlanningJob, "worker" | "site" | "notes">): string[] {
  const out: string[] = [];
  const add = (s: string | null) => {
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  const head = [j.worker, j.site].map((r) => (r ? cleanSite(r) : null)).filter((s): s is string => !!s);
  // два кандидата : если у одного есть код проекта (цифры), а у другого нет - второй это клиент/владелец.
  const coded = head.filter((s) => CODE.test(s) || /\d/.test(s));
  for (const s of coded.length > 0 && head.length > 1 ? coded : head) add(s);
  for (const raw of j.notes) {
    const s = cleanSite(raw);
    if (s && (CODE.test(s) || BRAND.test(s))) add(s);
  }
  return out;
}

/** Номер команды (« 5 ») → названия объектов за окно [from, to] (ISO), самые свежие первыми. */
export function siteSuggestionsByTeam(jobs: PlanningJob[], from: string, to: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const inWindow = jobs
    .filter((j) => /^\d+$/.test(j.team) && j.dateFromIso && j.dateToIso && j.dateToIso >= from && j.dateFromIso <= to)
    .sort((a, b) => (b.dateFromIso ?? "").localeCompare(a.dateFromIso ?? ""));
  for (const j of inWindow) {
    const list = (out[j.team] ??= []);
    for (const s of sitesOfJob(j)) if (!list.some((x) => x.toLowerCase() === s.toLowerCase())) list.push(s);
  }
  return out;
}

export type SiteJob = { name: string; team: string; from: string; to: string };

/** Все объекты из планинга за окно [from, to] : одна строка на (объект, команда), с датами работ. */
export function siteJobsInWindow(jobs: PlanningJob[], from: string, to: string): SiteJob[] {
  const map = new Map<string, SiteJob>();
  // Один объект в планинге пишут по-разному (« 18-GEN-DUSANNIER » / « 18-GEN-DUSANNIER Rétrofit »,
  // « LACOMBE SOLAIRE » / « LACOMBE SOLAIRE ET ENERGIE ») : в рамках одной команды склеиваем по началу названия.
  const norm = (n: string) => n.toLowerCase().replace(/\b(r[ée]trofit|ombr)\b/g, "").replace(/\s+/g, " ").trim();
  for (const j of jobs) {
    if (!/^\d+$/.test(j.team) || !j.dateFromIso || !j.dateToIso || j.dateToIso < from || j.dateFromIso > to) continue;
    for (const s of sitesOfJob(j)) {
      const n = norm(s);
      const existingKey = Array.from(map.keys()).find((k) => {
        const [kn, kt] = k.split("|");
        return kt === j.team && (kn === n || kn.startsWith(n + " ") || n.startsWith(kn + " "));
      });
      const key = existingKey ?? `${n}|${j.team}`;
      const cur = map.get(key);
      if (!cur) map.set(key, { name: s, team: j.team, from: j.dateFromIso, to: j.dateToIso });
      else {
        if (s.length < cur.name.length) cur.name = s;
        if (j.dateFromIso < cur.from) cur.from = j.dateFromIso;
        if (j.dateToIso > cur.to) cur.to = j.dateToIso;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.from.localeCompare(a.from));
}
