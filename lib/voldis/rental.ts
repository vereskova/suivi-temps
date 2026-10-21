/** VOLDIS — location de locaux : types et règles de calcul partagés (UI + API). */

export type ChargeStatus = "paid" | "partial" | "late" | "unpaid" | "lost";

export type VProperty = {
  id: string;
  lot_number: string;
  label: string | null;
  address: string | null;
  surface_m2: number | null;
  kind: string;
  list_rent: number | null;
  status: "available" | "rented" | "notice" | "unavailable" | "works";
  notes: string | null;
};

export type VTenant = {
  id: string;
  name: string;
  siren: string | null;
  vat_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  notes: string | null;
};

export type VLease = {
  id: string;
  property_id: string;
  tenant_id: string;
  lease_type: string;
  start_date: string;
  end_date: string | null;
  rent_ht: number | null;
  vat: number | null;
  charges: number | null;
  monthly_total: number;
  deposit: number;
  billing_day: number;
  is_active: boolean;
  notes: string | null;
};

export type VCharge = {
  id: string;
  lease_id: string | null;
  property_id: string | null;
  tenant_id: string | null;
  kind: "rent" | "deposit" | "other";
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  amount_due: number;
  vat_amount: number;
  amount_paid: number;
  paid_on: string | null;
  status: ChargeStatus;
  description: string | null;
};

export type VBankTx = {
  id: string;
  external_id: string;
  source: string;
  category: string | null;
  bank_account: string | null;
  iban: string | null;
  amount: number;
  side: "credit" | "debit";
  currency: string;
  label: string | null;
  reference: string | null;
  note: string | null;
  counterparty: string | null;
  settled_at: string | null;
  emitted_at: string | null;
  status: string | null;
  charge_id: string | null;
};

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0);
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reste à encaisser sur une échéance (jamais négatif). */
export function remaining(c: Pick<VCharge, "amount_due" | "amount_paid">): number {
  return Math.max(0, round2(num(c.amount_due) - num(c.amount_paid)));
}

/** Statut calculé à partir des montants (hors « perdu », décidé à la main). */
export function statusFor(c: Pick<VCharge, "amount_due" | "amount_paid" | "due_date" | "status">, today = new Date()): ChargeStatus {
  if (c.status === "lost") return "lost";
  const due = num(c.amount_due);
  const paid = num(c.amount_paid);
  if (due > 0 && paid >= due - 0.005) return "paid";
  if (paid > 0) return "partial";
  return c.due_date < today.toISOString().slice(0, 10) ? "late" : "unpaid";
}

export const normName = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(SARL|SAS|SASU|EURL|EI|SCI|SA|ETS|STE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Le libellé bancaire contient-il le nom du locataire (ou tous ses mots significatifs) ? */
export function nameMatches(txText: string, tenantName: string): boolean {
  const hay = normName(txText);
  const needle = normName(tenantName);
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  const words = needle.split(" ").filter((w) => w.length >= 3);
  return words.length > 0 && words.every((w) => hay.includes(w));
}

export type MatchSuggestion = { tx: VBankTx; charge: VCharge; tenantName: string; exact: boolean };

/**
 * Propose, pour chaque virement reçu non rapproché, l'échéance impayée du même
 * locataire (nom dans le libellé). `exact` = le montant correspond au reste dû.
 * Une échéance n'est proposée qu'une fois (la plus ancienne d'abord).
 */
export function suggestMatches(txs: VBankTx[], charges: VCharge[], tenants: VTenant[]): MatchSuggestion[] {
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const open = charges
    .filter((c) => c.kind === "rent" && c.status !== "paid" && c.status !== "lost" && remaining(c) > 0 && c.tenant_id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const used = new Set<string>();
  const out: MatchSuggestion[] = [];
  txs
    .filter((t) => t.side === "credit" && !t.charge_id)
    .sort((a, b) => (a.settled_at ?? "").localeCompare(b.settled_at ?? ""))
    .forEach((tx) => {
      const text = [tx.label, tx.counterparty, tx.reference, tx.note].filter(Boolean).join(" ");
      const candidates = open.filter((c) => !used.has(c.id) && nameMatches(text, tenantById.get(c.tenant_id!)?.name ?? ""));
      if (candidates.length === 0) return;
      const exact = candidates.find((c) => Math.abs(remaining(c) - num(tx.amount)) < 0.01);
      const chosen = exact ?? candidates[0];
      used.add(chosen.id);
      out.push({ tx, charge: chosen, tenantName: tenantById.get(chosen.tenant_id!)?.name ?? "", exact: !!exact });
    });
  return out;
}

export const STATUS_LABEL: Record<ChargeStatus, { fr: string; ru: string }> = {
  paid: { fr: "Payé", ru: "Оплачено" },
  partial: { fr: "Partiel", ru: "Частично" },
  late: { fr: "En retard", ru: "Просрочено" },
  unpaid: { fr: "À venir", ru: "Ожидается" },
  lost: { fr: "Perdu", ru: "Потеряно" },
};

export const PROPERTY_STATUS_LABEL: Record<VProperty["status"], { fr: string; ru: string }> = {
  available: { fr: "Libre", ru: "Свободен" },
  rented: { fr: "Loué", ru: "Сдан" },
  notice: { fr: "Préavis", ru: "Предупреждение" },
  unavailable: { fr: "Indisponible", ru: "Недоступен" },
  works: { fr: "Travaux", ru: "Ремонт" },
};

/** Dernier jour du mois (year, month 1-12) au format AAAA-MM-JJ. */
export function monthEnd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
