/**
 * Import de relevés bancaires (Crédit Agricole : OFX, QIF ou CSV) pour VOLDIS.
 * Même principe que l'« Import bancaire » de Rentila : on charge le fichier,
 * les opérations déjà connues (même date + montant + début de libellé) sont ignorées.
 */

export type ParsedTx = {
  date: string; // AAAA-MM-JJ
  amount: number; // signé : + crédit, − débit
  label: string;
  fitId?: string;
};

export type TxRow = {
  external_id: string;
  source: string;
  amount: number;
  side: "credit" | "debit";
  label: string;
  counterparty: string | null;
  settled_at: string;
  emitted_at: string;
  status: string;
  category: string | null;
};

const alnum = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Clé de dédoublonnage : date + montant (centimes) + 14 premiers caractères alphanumériques du libellé. */
export function externalId(date: string, amount: number, label: string): string {
  return `${date}|${Math.round(amount * 100)}|${alnum(label).slice(0, 14)}`;
}

export function categoryFor(label: string): string | null {
  const l = alnum(label);
  if (l.includes("REMBOURSEMENTDEPRET")) return "Emprunt";
  if (l.includes("ASSUCAAEPRET")) return "Assurance emprunt";
  if (l.includes("AXAFRANCE")) return "Assurance";
  if (l.includes("DIRECTIONGENERALEDESFINANCES") || l.includes("IMPOTTF")) return "Taxe foncière";
  if (l.includes("TENUEDECOMPTE")) return "Frais bancaires";
  return null;
}

/** Transforme les opérations lues en lignes prêtes pour la table, avec un suffixe #n pour les doublons d'un même fichier. */
export function toRows(txs: ParsedTx[], source: string): TxRow[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const base = externalId(t.date, t.amount, t.label);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const iso = `${t.date}T12:00:00.000Z`;
    return {
      external_id: n === 1 ? base : `${base}#${n}`,
      source,
      amount: Math.abs(t.amount),
      side: t.amount >= 0 ? "credit" : "debit",
      label: t.label,
      counterparty: counterpartyOf(t.label),
      settled_at: iso,
      emitted_at: iso,
      status: "completed",
      category: categoryFor(t.label),
    };
  });
}

/** Nom du tiers extrait du libellé (« VIR INST de XXX », « vers XXX »), sinon null. */
export function counterpartyOf(label: string): string | null {
  const m = label.match(/\bde ([A-Z0-9&'.\- ]{3,}?)(?: VIR | Loyer| LOYER| Envoye| LOC |$)/) ?? label.match(/\bvers ([A-Za-z0-9&'.\- ]{3,}?)(?: No | N |$)/);
  return m ? m[1].trim() : null;
}

const parseAmount = (raw: string): number => {
  const s = raw.replace(/[\s€ ]/g, "");
  if (!s) return NaN;
  // « 1.234,56 » / « 1 234,56 » / « -3.10 » / « 1,545.40 »
  if (s.includes(",") && s.includes(".")) {
    return s.lastIndexOf(",") > s.lastIndexOf(".") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  }
  return Number(s.replace(",", "."));
};

const frDate = (s: string): string | null => {
  const m = s.trim().match(/^(\d{2})[/.-](\d{2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2]}-${m[1]}`;
};

export function parseOfx(text: string): ParsedTx[] {
  const out: ParsedTx[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const tag = (name: string) => b.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
    const d = tag("DTPOSTED").slice(0, 8);
    const amount = parseAmount(tag("TRNAMT"));
    if (d.length < 8 || !Number.isFinite(amount)) continue;
    const label = [tag("NAME"), tag("MEMO")].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    out.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, amount, label, fitId: tag("FITID") || undefined });
  }
  return out;
}

export function parseQif(text: string): ParsedTx[] {
  const out: ParsedTx[] = [];
  let cur: { date?: string; amount?: number; payee?: string; memo?: string } = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const code = line[0];
    const val = line.slice(1).trim();
    if (code === "D") cur.date = frDate(val.replace(/'/g, "/")) ?? undefined;
    else if (code === "T" || code === "U") cur.amount = parseAmount(val);
    else if (code === "P") cur.payee = val;
    else if (code === "M") cur.memo = val;
    else if (code === "^") {
      if (cur.date && cur.amount !== undefined && Number.isFinite(cur.amount)) {
        out.push({ date: cur.date, amount: cur.amount, label: [cur.payee, cur.memo].filter(Boolean).join(" ") });
      }
      cur = {};
    }
  }
  return out;
}

/** CSV Crédit Agricole : « Date;Libellé;Débit euros;Crédit euros » (ou une colonne « Montant » signée). */
export function parseCsv(text: string): ParsedTx[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = lines.some((l) => l.includes(";")) ? ";" : ",";
  const split = (l: string) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
  const headIdx = lines.findIndex((l) => /date/i.test(l) && /(d[ée]bit|montant|libell)/i.test(l));
  if (headIdx < 0) return [];
  const head = split(lines[headIdx]).map((h) => alnum(h));
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iDate = col(/^DATE/);
  const iLabel = col(/LIBELLE|DESCRIPTION|OPERATION/);
  const iDebit = col(/DEBIT/);
  const iCredit = col(/CREDIT/);
  const iAmount = col(/^MONTANT/);
  const out: ParsedTx[] = [];
  for (const l of lines.slice(headIdx + 1)) {
    const c = split(l);
    const date = iDate >= 0 ? frDate(c[iDate] ?? "") : null;
    if (!date) continue;
    let amount = NaN;
    if (iAmount >= 0) amount = parseAmount(c[iAmount] ?? "");
    else {
      const debit = iDebit >= 0 ? parseAmount(c[iDebit] ?? "") : NaN;
      const credit = iCredit >= 0 ? parseAmount(c[iCredit] ?? "") : NaN;
      if (Number.isFinite(credit) && credit !== 0) amount = credit;
      else if (Number.isFinite(debit) && debit !== 0) amount = debit > 0 ? -debit : debit;
    }
    if (!Number.isFinite(amount)) continue;
    out.push({ date, amount, label: (c[iLabel >= 0 ? iLabel : 1] ?? "").replace(/\s+/g, " ") });
  }
  return out;
}

export function parseBankFile(name: string, text: string): ParsedTx[] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".ofx") || /<OFX>|<STMTTRN>/i.test(text)) return parseOfx(text);
  if (lower.endsWith(".qif") || /^!Type/im.test(text)) return parseQif(text);
  return parseCsv(text);
}
