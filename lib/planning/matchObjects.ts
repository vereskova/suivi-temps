import type { SiteJob } from "@/lib/planning/siteSuggestions";

// Сопоставление объектов приложения (названия из папок iCloud) с объектами из планинга (Google Sheet):
// по команде и по названию. Нужно, чтобы взять дату начала объекта из планинга.

const STOP = new Set(["sas", "sci", "gaec", "earl", "sarl", "scea", "eurl", "ets", "mr", "mme", "de", "du", "des", "la", "le", "les", "et", "chantier", "bat", "batiment", "retrofit", "ombr", "ombriere", "sud", "nord", "centrale", "ppv"]);

export function nameTokens(raw: string): string[] {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

/** Оценка 0..1: доля общих значимых слов; код проекта (цифры) совпадает - сразу высокий балл. */
export function nameScore(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const sa = new Set(ta);
  const common = tb.filter((t) => sa.has(t));
  if (common.length === 0) return 0;
  // совпал код вида 12545 / h53100 / 20883 (>= 4 цифр подряд)
  if (common.some((t) => /\d{4,}/.test(t))) return 1;
  // разные номера (« SOLANACEA 1 » и « SOLANACEA 2 », « OPTIM23-11 » и « OPTIM23-23 ») - это разные объекты
  const small = (ts: string[]) => new Set(ts.filter((t) => /^\d{1,3}$/.test(t)));
  const na = small(ta);
  const nb = small(tb);
  if (na.size > 0 && nb.size > 0 && !Array.from(na).some((n) => nb.has(n))) return 0;
  const union = new Set([...ta, ...tb]).size;
  const jac = common.length / union;
  // одно длинное общее слово (фамилия клиента) тоже хороший признак
  const longest = Math.max(...common.map((t) => t.length));
  return Math.max(jac, longest >= 6 && common.length / Math.min(ta.length, tb.length) >= 0.5 ? 0.6 : 0);
}

export type ObjectRef = { id: string; name: string; team: number; start_date: string | null };

/** Для каждого объекта - лучшая задача планинга той же команды (порог 0.6). Дата начала = самая ранняя из подходящих задач. */
export function matchStartDates(objects: ObjectRef[], jobs: SiteJob[]): { object: ObjectRef; job: SiteJob; score: number }[] {
  const out: { object: ObjectRef; job: SiteJob; score: number }[] = [];
  for (const o of objects) {
    let best: { job: SiteJob; score: number } | null = null;
    for (const j of jobs) {
      if (Number(j.team) !== o.team) continue;
      const s = nameScore(o.name, j.name);
      if (s >= 0.6 && (!best || s > best.score || (s === best.score && j.from < best.job.from))) best = { job: j, score: s };
    }
    if (best) out.push({ object: o, ...best });
  }
  return out;
}
