/**
 * Minimal client for the Sinao invoicing API (https://api.sinao.app/v1),
 * used to push a confirmed commercial checklist as a draft ("brouillon")
 * quote. Sinao has no import for structured devis files (PDF import only,
 * unrelated) — this calls their real, documented REST API instead
 * (`POST /apps/{appId}/quotes` creates a quote in `draft` status by
 * default). There is no sandbox environment documented by Sinao: the very
 * first real call from this module runs against production Sinao data.
 *
 * Auth: a durable Api-Key created once by the company admin in Sinao's own
 * interface (Réglages > Clés API) — never a per-user bearer token. Read
 * from env, never exposed to the browser.
 */

const SINAO_BASE_URL = "https://api.sinao.app/v1";

export class SinaoError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Sinao API error ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

/** True once VLADIS has actually created a Sinao API key — until then, createDraftQuote() stubs instead of calling out. */
export function isSinaoConfigured(): boolean {
  return Boolean(process.env.SINAO_API_KEY && process.env.SINAO_APP_ID);
}

function getCredentials() {
  const apiKey = process.env.SINAO_API_KEY;
  const appId = process.env.SINAO_APP_ID;
  if (!apiKey || !appId) {
    throw new Error("Missing SINAO_API_KEY or SINAO_APP_ID environment variables.");
  }
  return { apiKey, appId };
}

/** Quote ids from the stub path are prefixed so callers can tell a simulated
 *  push apart from a real Sinao quote (e.g. to allow re-pushing for real
 *  once credentials are configured, instead of treating it as already sent). */
export const SINAO_STUB_PREFIX = "STUB-";

export function isStubQuoteId(quoteId: string | null | undefined): boolean {
  return Boolean(quoteId?.startsWith(SINAO_STUB_PREFIX));
}

async function sinaoFetch(path: string, init: RequestInit = {}) {
  const { apiKey, appId } = getCredentials();
  const res = await fetch(`${SINAO_BASE_URL}/apps/${appId}${path}`, {
    ...init,
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new SinaoError(res.status, body);
  }
  return body;
}

type SinaoOrganization = { id: number; name: string };

/** Finds an existing Sinao contact by name (avoids creating duplicates across dossiers for the same client). */
export async function findOrganizationByName(name: string): Promise<SinaoOrganization | null> {
  const result = await sinaoFetch(`/organizations?search=${encodeURIComponent(name)}&limit=5`);
  const items: SinaoOrganization[] = Array.isArray(result) ? result : (result?.data ?? []);
  const exact = items.find((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase());
  return exact ?? items[0] ?? null;
}

export type SinaoQuoteCategory = {
  label: string;
  /** amount is cents (Sinao's own unit — "Price without taxes in cents"), vatPercent is basis points (20% = 2000). */
  items: { label: string; amount: number; vatPercent: number }[];
};

/**
 * Sinao's real content shape does NOT match its own published OpenAPI spec
 * (the spec's flat `SalesLine[]` with a `style: {type, position, section_id}`
 * wrapper is simply ignored — confirmed by direct testing: quotes created
 * or updated with that shape always come back with zero lines). The shape
 * actually persisted, read back from a real quote created by hand in
 * Sinao's own UI, is an array of sections, each holding its own `lines`:
 * `[{ detail?, lines: [{ detail, type, account_id, amount_accurately, ... }] }]`
 * — `type`/`account_id` sit directly on the line (no `style` nesting), and
 * the price field that actually takes effect is `amount_accurately`
 * (cents × 1000 — `amount` alone is accepted but silently ignored).
 */
type SinaoContentLine = {
  detail: string;
  action?: "sell";
  quantity?: number;
  amount_accurately?: number;
  vat_percent?: number;
  unity?: string;
  type: "product";
  account_id: number;
};

type SinaoContentSection = {
  detail?: string;
  lines: SinaoContentLine[];
};

/**
 * "Prestations de services" (PCG 706) — the sales account VLADIS's real
 * quotes book against (confirmed by reading one back). A line with no
 * account_id never gets aggregated into the quote's totals, so every line
 * needs one; VLADIS has no other services revenue account to pick between.
 */
const SINAO_SALES_ACCOUNT_ID = 55;

function buildContent(categories: SinaoQuoteCategory[]): SinaoContentSection[] {
  return categories
    .filter((category) => category.items.length > 0)
    .map((category) => ({
      detail: category.label,
      lines: category.items.map((item) => ({
        detail: item.label,
        action: "sell" as const,
        quantity: 1,
        amount_accurately: item.amount * 1000,
        vat_percent: item.vatPercent,
        unity: "forfait",
        type: "product" as const,
        account_id: SINAO_SALES_ACCOUNT_ID,
      })),
    }));
}

/**
 * Sets a quote's line items via its update endpoint. Content is always
 * pushed this way, never as part of the initial create call: Sinao's
 * create endpoint accepts a `content` parameter but silently drops it —
 * confirmed by every quote created through this integration coming back
 * empty until content was set via a follow-up call like this one.
 */
async function pushContent(quoteId: string, categories: SinaoQuoteCategory[]): Promise<void> {
  await sinaoFetch(`/quotes/${quoteId}`, {
    method: "POST",
    body: JSON.stringify({ content: buildContent(categories) }),
  });
}

export type CreateDraftQuoteResult = {
  quoteId: string;
  organizationId: number;
  stub: boolean;
};

/**
 * Creates a draft quote for `clientName`, then pushes the given categorized
 * line items onto it via a follow-up call (see pushContent — Sinao's create
 * endpoint doesn't apply `content` itself).
 *
 * Stub mode: VLADIS hasn't created a Sinao API key yet, so until
 * SINAO_API_KEY/SINAO_APP_ID are set, this skips the network call entirely
 * and returns a fake quote id instead of failing — lets the rest of the
 * commercial workflow (checklist, both PDFs, the "already pushed" state) be
 * used and demoed today. Swap to the real thing automatically the moment
 * the env vars are configured, no code change needed.
 */
export async function createDraftQuote(params: {
  clientName: string;
  knownOrganizationId: string | null;
  title: string;
  categories: SinaoQuoteCategory[];
}): Promise<CreateDraftQuoteResult> {
  const { clientName, knownOrganizationId, title, categories } = params;

  if (!isSinaoConfigured()) {
    return {
      quoteId: `${SINAO_STUB_PREFIX}${Date.now().toString(36).toUpperCase()}`,
      organizationId: 0,
      stub: true,
    };
  }

  let organizationId: number;
  if (knownOrganizationId) {
    organizationId = Number(knownOrganizationId);
  } else {
    const existing = await findOrganizationByName(clientName);
    organizationId = existing?.id ?? 0; // 0 signals "let Sinao create it from name" below
  }

  const contact_infos =
    organizationId > 0
      ? { id: organizationId, type: "organization" as const }
      : { type: "organization" as const, name: clientName };

  const created = await sinaoFetch("/quotes", {
    method: "POST",
    body: JSON.stringify({ contact_infos, title }),
  });

  const resolvedOrganizationId: number = created?.contact_infos?.id ?? organizationId;
  await pushContent(String(created.id), categories);

  return { quoteId: String(created.id), organizationId: resolvedOrganizationId, stub: false };
}

export type UpdateDraftQuoteResult = {
  quoteId: string;
};

/**
 * Replaces the line items of an already-created Sinao quote — used when a
 * commercial case is re-pushed after its checklist changed (e.g. prices
 * added after the very first push). The previous content is fully
 * replaced, not merged.
 */
export async function updateDraftQuote(params: {
  quoteId: string;
  categories: SinaoQuoteCategory[];
}): Promise<UpdateDraftQuoteResult> {
  const { quoteId, categories } = params;
  await pushContent(quoteId, categories);
  return { quoteId };
}
