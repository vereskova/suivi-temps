/** VOLDIS - location de locaux : types et règles de calcul partagés (UI + API). */

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
  occupant: string | null;
  pays_cash: boolean;
};

export type VTenant = {
  id: string;
  name: string;
  siren: string | null;
  vat_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  representative: string | null;
  billing_email: string | null;
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
  index_type: "ILC" | "ILAT" | "IRL" | "none" | null;
  next_revision_date: string | null;
  notice_months: number | null;
  terminated_on: string | null;
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
  reminded_at: string | null;
  paid_cash?: boolean;
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
  tenant_id: string | null;
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
  // « JOUETS » / « JOUET » : on compare sans le S final pour tolérer pluriels et abréviations
  const words = needle.split(" ").filter((w) => w.length >= 3).map((w) => w.replace(/S$/, ""));
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
      const txDay = (tx.settled_at ?? "").slice(0, 10);
      // un virement ne règle pas un loyer appelé bien après lui : on exige qu'il date d'au plus 7 jours avant l'échéance
      const notBefore = (due: string) => new Date(Date.parse(`${due}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
      const candidates = open.filter(
        (c) => !used.has(c.id) && txDay >= notBefore(c.due_date) && nameMatches(text, tenantById.get(c.tenant_id!)?.name ?? "")
      );
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

// ───────────────────────── Fiche société, factures, documents ─────────────────────────

export type VSettings = {
  id: number;
  company_name: string;
  legal_form: string | null;
  siren: string | null;
  vat_number: string | null;
  address: string | null;
  iban: string | null;
  bic: string | null;
  email: string | null;
  phone: string | null;
  payment_terms: string;
  late_penalty: string;
  invoice_prefix: string;
  receipt_prefix: string;
};

export type InvoiceLine = { label: string; amount_ht: number; vat_rate: number; vat: number; amount_ttc: number };

export type VInvoice = {
  id: string;
  number: string;
  kind: "invoice" | "receipt";
  tenant_id: string | null;
  lease_id: string | null;
  charge_id: string | null;
  issue_date: string;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  lines: InvoiceLine[];
  total_ht: number;
  vat_amount: number;
  total_ttc: number;
  status: "draft" | "sent" | "void";
  pdf_path: string | null;
  sent_at: string | null;
  sent_to: string | null;
  notes: string | null;
};

export type VDocument = {
  id: string;
  tenant_id: string | null;
  lease_id: string | null;
  property_id: string | null;
  kind: "contract" | "amendment" | "inventory" | "insurance" | "identity" | "invoice" | "other";
  title: string;
  storage_path: string;
  mime: string | null;
  size_bytes: number | null;
  uploaded_at: string;
};

export const DOCUMENT_KIND_LABEL: Record<VDocument["kind"], { fr: string; ru: string }> = {
  contract: { fr: "Contrat de bail", ru: "Договор аренды" },
  amendment: { fr: "Avenant", ru: "Допсоглашение" },
  inventory: { fr: "État des lieux", ru: "Акт приёма-передачи" },
  insurance: { fr: "Assurance", ru: "Страховка" },
  identity: { fr: "Pièce d'identité / Kbis", ru: "Удостоверение / Kbis" },
  invoice: { fr: "Facture", ru: "Счёт" },
  other: { fr: "Autre", ru: "Другое" },
};

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const monthLabelFr = (isoDate: string) => `${MONTHS_FR[Number(isoDate.slice(5, 7)) - 1]} ${isoDate.slice(0, 4)}`;

/**
 * Lignes d'une facture à partir de l'échéance et du bail. Si le montant appelé est celui du bail et que le bail
 * détaille loyer HT / charges / TVA, on reprend ce détail ; sinon une ligne unique (TVA de l'échéance incluse).
 */
export function buildInvoiceLines(
  charge: Pick<VCharge, "amount_due" | "vat_amount" | "period_start" | "due_date" | "description" | "kind">,
  lease: Pick<VLease, "monthly_total" | "rent_ht" | "vat" | "charges"> | null
): InvoiceLine[] {
  const period = monthLabelFr(charge.period_start ?? charge.due_date);
  const due = round2(num(charge.amount_due));
  const detailed = lease && lease.rent_ht != null && Math.abs(num(lease.monthly_total) - due) < 0.01;
  if (charge.kind === "rent" && detailed) {
    const ht = round2(num(lease!.rent_ht));
    const vat = round2(num(lease!.vat));
    const charges = round2(num(lease!.charges));
    const rate = ht > 0 ? Math.round((vat / ht) * 100) : 0;
    const lines: InvoiceLine[] = [{ label: `Loyer ${period}`, amount_ht: ht, vat_rate: rate, vat, amount_ttc: round2(ht + vat) }];
    if (charges > 0) lines.push({ label: `Provision sur charges ${period}`, amount_ht: charges, vat_rate: 0, vat: 0, amount_ttc: charges });
    return lines;
  }
  const vat = round2(num(charge.vat_amount));
  const ht = round2(due - vat);
  const label = charge.kind === "deposit" ? "Dépôt de garantie" : charge.description?.trim() || `Loyer ${period}`;
  return [{ label, amount_ht: ht, vat_rate: ht > 0 ? Math.round((vat / ht) * 100) : 0, vat, amount_ttc: due }];
}

export const totalsOf = (lines: InvoiceLine[]) => ({
  total_ht: round2(lines.reduce((s, l) => s + l.amount_ht, 0)),
  vat_amount: round2(lines.reduce((s, l) => s + l.vat, 0)),
  total_ttc: round2(lines.reduce((s, l) => s + l.amount_ttc, 0)),
});

/** Prochain numéro « F-2026-0007 » d'après les numéros existants de l'année. */
export function nextInvoiceNumber(prefix: string, year: number, existing: string[]): string {
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = existing.reduce((m, n) => {
    const hit = n.match(re);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}


// ───────────────────────── Платежи по договору: считаются автоматически ─────────────────────────

/** Сколько дней после срока платёж ещё считается «ожидается», а не «просрочен». */
export const GRACE_DAYS = 7;

export type RentState = "paid" | "partial" | "late" | "expected" | "lost";

export const RENT_STATE_LABEL: Record<RentState, string> = {
  paid: "Оплачено",
  partial: "Частично",
  late: "Просрочено",
  expected: "Ожидается",
  lost: "Списано",
};

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Состояние платежа считается из сумм и сроков, а не хранится: нельзя забыть обновить. */
export function rentState(c: Pick<VCharge, "amount_due" | "amount_paid" | "due_date" | "status">, today = new Date().toISOString().slice(0, 10)): RentState {
  if (c.status === "lost") return "lost";
  const due = num(c.amount_due);
  const paid = num(c.amount_paid);
  if (due > 0 && paid >= due - 0.005) return "paid";
  if (paid > 0) return today > addDays(c.due_date, GRACE_DAYS) ? "late" : "partial";
  return today > addDays(c.due_date, GRACE_DAYS) ? "late" : "expected";
}

export const MONTHS_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export const monthLabelRu = (ym: string) => `${MONTHS_RU[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const ymOf = (iso: string) => iso.slice(0, 7);

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Действует ли договор в этом месяце (хотя бы один день месяца). */
export function leaseCoversMonth(l: Pick<VLease, "start_date" | "end_date" | "is_active" | "terminated_on">, ym: string): boolean {
  const first = `${ym}-01`;
  const last = monthEnd(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
  const end = l.terminated_on ?? l.end_date;
  return l.start_date <= last && (!end || end >= first);
}

/** Дата платежа месяца по договору. */
export const dueDateOf = (ym: string, billingDay: number) => `${ym}-${String(Math.min(28, Math.max(1, billingDay))).padStart(2, "0")}`;

/**
 * Платежи, которых ещё нет в базе: каждый действующий договор ожидает платёж за каждый месяц
 * от начала (но не раньше `fromYm`) до текущего. Возвращает строки для вставки.
 */
export function missingCharges(leases: VLease[], charges: VCharge[], todayYm: string, fromYm = "2025-11"): Record<string, unknown>[] {
  const have = new Set(charges.filter((c) => c.kind === "rent" && c.lease_id).map((c) => `${c.lease_id}|${ymOf(c.due_date)}`));
  const rows: Record<string, unknown>[] = [];
  for (const l of leases) {
    if (!l.is_active) continue;
    for (let ym = ymOf(l.start_date) > fromYm ? ymOf(l.start_date) : fromYm; ym <= todayYm; ym = shiftMonth(ym, 1)) {
      if (!leaseCoversMonth(l, ym) || have.has(`${l.id}|${ym}`)) continue;
      const last = monthEnd(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
      rows.push({
        lease_id: l.id,
        property_id: l.property_id,
        tenant_id: l.tenant_id,
        kind: "rent",
        due_date: dueDateOf(ym, l.billing_day),
        period_start: `${ym}-01`,
        period_end: last,
        amount_due: l.monthly_total,
        vat_amount: num(l.vat),
        amount_paid: 0,
        status: "unpaid",
        description: `Аренда ${ym}`,
      });
    }
  }
  return rows;
}
