/**
 * VOLDIS - rapprochement bancaire : propose, pour chaque virement reçu, le locataire et l'échéance.
 * « Apprentissage » : les mouvements déjà rattachés à un locataire (directement ou via une échéance)
 * servent de modèle - un nouveau virement dont le libellé a la même « signature » reçoit la même proposition.
 */
import { categoryFor } from "./bank-import";
import { nameMatches, num, remaining, type VBankTx, type VCharge, type VTenant } from "./rental";

/** Mots de bruit des libellés bancaires, sans valeur pour reconnaître le payeur. */
const NOISE = new Set([
  "VIREMENT", "EN", "VOTRE", "FAVEUR", "VIR", "INST", "DE", "DU", "DES", "LA", "LE", "ET", "VU", "DEPOT", "LOYER", "LOC",
  "SARL", "SAS", "SASU", "EURL", "EI", "SCI", "SA", "SELAS", "M", "MME", "ENVOYE", "DEPUIS", "QONTO", "SCTINSTOUT", "RAWSCTOUT", "VERS",
]);

const stripDiacritics = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/**
 * Signature stable d'un libellé : ses 3 premiers mots « utiles » (sans références chiffrées ni mots de bruit).
 * « VIR INST de LUX MOTORS Loyer 01/26 SCTINSTOUT3wg… » → « LUX MOTORS » ;
 * « SASU SPOOMS TRAITEUR VU53212… LOYER NOVEMBRE » → « SPOOMS TRAITEUR NOVEMBRE ».
 */
export function signature(label: string | null | undefined): string {
  const words = stripDiacritics(label ?? "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/\d/.test(w) && !NOISE.has(w));
  return words.slice(0, 2).join(" ");
}

export type Proposal =
  | { kind: "link"; tx: VBankTx; tenant: VTenant; charge: VCharge; confidence: "sure" | "maybe"; reason: string }
  | { kind: "pay"; tx: VBankTx; tenant: VTenant; charge: VCharge; confidence: "sure" | "maybe"; reason: string }
  | { kind: "assign"; tx: VBankTx; tenant: VTenant; confidence: "sure" | "maybe"; reason: string };

const day = (iso: string | null) => (iso ?? "").slice(0, 10);
const daysBetween = (a: string, b: string) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/**
 * Locataire probable d'un virement : (1) la signature a déjà été rattachée à un locataire,
 * (2) sinon le nom du locataire figure dans le libellé.
 */
export function guessTenant(
  tx: VBankTx,
  tenants: VTenant[],
  learned: Map<string, string>
): { tenant: VTenant; reason: string } | null {
  const text = [tx.label, tx.counterparty, tx.reference, tx.note].filter(Boolean).join(" ");
  const sig = signature(text);
  const learnedId = sig ? learned.get(sig) : undefined;
  if (learnedId) {
    const t = tenants.find((x) => x.id === learnedId);
    if (t) return { tenant: t, reason: `уже привязан: «${sig}»` };
  }
  const named = tenants.filter((t) => nameMatches(text, t.name));
  if (named.length === 1) return { tenant: named[0], reason: "имя в тексте платежа" };
  return null;
}

/** Table signature → locataire construite à partir des mouvements déjà rattachés (majorité en cas de désaccord). */
export function learnSignatures(txs: VBankTx[], charges: VCharge[]): Map<string, string> {
  const chargeTenant = new Map(charges.map((c) => [c.id, c.tenant_id]));
  const votes = new Map<string, Map<string, number>>();
  txs.forEach((t) => {
    const tenantId = t.tenant_id ?? (t.charge_id ? chargeTenant.get(t.charge_id) : null);
    if (!tenantId) return;
    const sig = signature([t.label, t.counterparty, t.reference, t.note].filter(Boolean).join(" "));
    if (!sig) return;
    const m = votes.get(sig) ?? new Map<string, number>();
    m.set(tenantId, (m.get(tenantId) ?? 0) + 1);
    votes.set(sig, m);
  });
  const out = new Map<string, string>();
  votes.forEach((m, sig) => {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) out.set(sig, best[0]);
  });
  return out;
}

/**
 * Propositions pour tous les virements reçus pas encore traités :
 *  - link   : l'échéance du locataire comptabilise déjà ce paiement (même montant, date voisine) → simple rattachement ;
 *  - pay    : une échéance impayée du locataire correspond → enregistrer le paiement ;
 *  - assign : locataire reconnu mais aucune échéance → rattacher au locataire seulement.
 */
export function proposeMatches(txs: VBankTx[], charges: VCharge[], tenants: VTenant[]): Proposal[] {
  const learned = learnSignatures(txs, charges);
  const claimed = new Set<string>(); // échéances ouvertes déjà proposées
  const alreadyLinkedAmount = new Map<string, number>();
  txs.filter((t) => t.charge_id).forEach((t) => alreadyLinkedAmount.set(t.charge_id!, (alreadyLinkedAmount.get(t.charge_id!) ?? 0) + num(t.amount)));
  const out: Proposal[] = [];

  txs
    .filter((t) => t.side === "credit" && !t.charge_id && !t.tenant_id)
    .sort((a, b) => day(a.settled_at).localeCompare(day(b.settled_at)))
    .forEach((tx) => {
      const g = guessTenant(tx, tenants, learned);
      if (!g) return;
      const amount = num(tx.amount);
      const txDay = day(tx.settled_at);
      const mine = charges.filter((c) => c.tenant_id === g.tenant.id && c.status !== "lost");

      // 1. échéance déjà encaissée pour ce montant, autour de cette date
      const covered = mine
        .filter((c) => num(c.amount_paid) > 0 && c.paid_on && daysBetween(c.paid_on, txDay) <= 20)
        .filter((c) => num(c.amount_paid) - (alreadyLinkedAmount.get(c.id) ?? 0) >= amount - 0.01)
        .sort((a, b) => Math.abs(num(a.amount_paid) - amount) - Math.abs(num(b.amount_paid) - amount) || daysBetween(a.paid_on!, txDay) - daysBetween(b.paid_on!, txDay));
      if (covered[0]) {
        const c = covered[0];
        const exact = Math.abs(num(c.amount_paid) - amount) < 0.01;
        alreadyLinkedAmount.set(c.id, (alreadyLinkedAmount.get(c.id) ?? 0) + amount);
        out.push({ kind: "link", tx, tenant: g.tenant, charge: c, confidence: exact ? "sure" : "maybe", reason: `${g.reason}${exact ? ", сумма совпадает" : ", часть платежа"}` });
        return;
      }

      // 2. échéance impayée correspondante (virement postérieur à 7 jours avant l'échéance)
      const open = mine
        .filter((c) => c.kind === "rent" && c.status !== "paid" && remaining(c) > 0 && !claimed.has(c.id))
        .filter((c) => txDay >= new Date(Date.parse(`${c.due_date}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10))
        .sort((a, b) => Math.abs(remaining(a) - amount) - Math.abs(remaining(b) - amount) || a.due_date.localeCompare(b.due_date));
      if (open[0]) {
        const c = open[0];
        claimed.add(c.id);
        const exact = Math.abs(remaining(c) - amount) < 0.01;
        out.push({ kind: "pay", tx, tenant: g.tenant, charge: c, confidence: exact ? "sure" : "maybe", reason: `${g.reason}${exact ? ", сумма равна остатку" : ", сумма отличается"}` });
        return;
      }

      // 3. locataire reconnu, aucune échéance
      out.push({ kind: "assign", tx, tenant: g.tenant, confidence: "sure", reason: g.reason });
    });
  return out;
}

// ───────────────────────── Lecture claire de la liste bancaire ─────────────────────────

/** Libellé lisible : sans formules bancaires ni références techniques (le texte complet reste en infobulle). */
export function cleanLabel(label: string | null | undefined): string {
  let s = (label ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/^VIREMENT EN VOTRE FAVEUR\s*/i, "");
  s = s.replace(/^VIR INST de\s*/i, "");
  s = s.replace(/^VIREMENT EMIS VIR INST vers\s*/i, "→ ");
  s = s.replace(/^PRELEVEMENT\s*/i, "");
  const loan = s.match(/^REMBOURSEMENT DE PRET .*\b(CAPITAL|INTERETS)\b/i);
  if (loan) return loan[1].toUpperCase() === "CAPITAL" ? "Кредит: основной долг" : "Кредит: проценты";
  if (/^REGLEMENT ASSU\. CAAE PRET/i.test(s)) return "Страховка кредита";
  if (/^AXA FRANCE/i.test(s)) return "Страховка AXA";
  if (/^DIRECTION GENERALE DES FINANCES/i.test(s)) return "Налог на недвижимость (DGFiP)";
  if (/^Tenue de compte/i.test(s)) return "Комиссия за ведение счёта";
  s = s
    .split(" ")
    .filter((w) => !/^(SCTINSTOUT|RAWSCTOUT)/i.test(w) && !(w.length >= 7 && /\d/.test(w) && /[A-Za-z]/.test(w)) && !/^\d{6,}$/.test(w))
    .join(" ")
    .replace(/\bVIR DE .*? (?=[A-Z])/i, "")
    .trim();
  return s.length > 70 ? `${s.slice(0, 68)}…` : s || (label ?? "-");
}

export type TxFlag = { reason: string; action?: "assign" };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmt = (n: number) => `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Repère les opérations qui demandent un regard humain (clé = id du mouvement) ; les autres sont « reconnues » :
 *  - virement reçu sans locataire ni échéance ;
 *  - virement dont le montant ne correspond pas à l'échéance rattachée (ou au loyer du bail) ;
 *  - dépense récurrente dont le montant s'écarte nettement de l'habitude ;
 *  - grosse dépense sans catégorie.
 */
export function analyzeTxs(txs: VBankTx[], charges: VCharge[], tenants: VTenant[]): Map<string, TxFlag> {
  const out = new Map<string, TxFlag>();
  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const linkedSum = new Map<string, number>();
  txs.filter((t) => t.charge_id).forEach((t) => linkedSum.set(t.charge_id!, (linkedSum.get(t.charge_id!) ?? 0) + num(t.amount)));
  const proposalFor = new Map(proposeMatches(txs, charges, tenants).map((p) => [p.tx.id, p]));
  const categoryOf = (t: VBankTx) => t.category ?? categoryFor(t.label ?? "");

  // habitudes : montants par nature d'opération (libellé nettoyé), pour juger si un montant sort de l'ordinaire
  const keyOf = (t: VBankTx) => cleanLabel(t.label);
  const groups = new Map<string, number[]>();
  txs.filter((t) => t.side === "debit").forEach((t) => groups.set(keyOf(t), [...(groups.get(keyOf(t)) ?? []), num(t.amount)]));

  txs.forEach((t) => {
    const amount = num(t.amount);
    if (t.side === "credit") {
      if (t.charge_id || t.tenant_id || t.category) {
        const c = t.charge_id ? chargeById.get(t.charge_id) : null;
        if (c) {
          const sum = linkedSum.get(c.id) ?? amount;
          if (Math.abs(sum - num(c.amount_due)) > 0.5) out.set(t.id, { reason: `По платежу ожидалось ${fmt(num(c.amount_due))}` });
        }
        return;
      }
      const p = proposalFor.get(t.id);
      if (p) out.set(t.id, { reason: `Подтвердить: ${p.tenant.name}`, action: "assign" });
      else out.set(t.id, { reason: "Нужно определить плательщика", action: "assign" });
      return;
    }
    // dépenses : montant inhabituel pour une opération qui se répète, ou grosse dépense non classée
    const peers = groups.get(keyOf(t)) ?? [];
    if (peers.length >= 3) {
      const med = median(peers);
      const spread = peers.filter((x) => med > 0 && Math.abs(x - med) / med > 0.25).length / peers.length;
      if (spread < 0.4 && med > 0 && Math.abs(amount - med) / med > 0.25) out.set(t.id, { reason: `Обычно около ${fmt(med)}` });
      return;
    }
    if (!categoryOf(t) && amount >= 300) out.set(t.id, { reason: "Расход без категории" });
  });
  return out;
}
