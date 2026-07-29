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

function getCredentials() {
  const apiKey = process.env.SINAO_API_KEY;
  const appId = process.env.SINAO_APP_ID;
  if (!apiKey || !appId) {
    throw new Error("Missing SINAO_API_KEY or SINAO_APP_ID environment variables.");
  }
  return { apiKey, appId };
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
  items: { label: string }[];
};

type SalesLine = {
  detail: string;
  action?: "sell";
  quantity?: number;
  amount?: number;
  vat_percent?: number;
  unity?: string;
  style: { type: "section" | "description" | "product"; position: number; section_id?: number };
};

function buildFlatContent(categories: SinaoQuoteCategory[]): SalesLine[] {
  const lines: SalesLine[] = [];
  let position = 0;
  for (const category of categories) {
    position += 1;
    lines.push({ detail: category.label, style: { type: "description", position } });
    for (const item of category.items) {
      position += 1;
      lines.push({
        detail: item.label,
        action: "sell",
        quantity: 1,
        amount: 0,
        vat_percent: 2000, // 20% — standard rate; adjust if VLADIS uses a different one.
        unity: "forfait",
        style: { type: "product", position },
      });
    }
  }
  return lines;
}

/** Re-nests product lines under their category's description line, using the ids Sinao assigned on creation. */
function buildNestedContent(categories: SinaoQuoteCategory[], createdLines: { id: number; detail: string }[]): SalesLine[] | null {
  if (createdLines.length === 0) return null;
  let cursor = 0;
  const lines: SalesLine[] = [];
  for (const category of categories) {
    const sectionLine = createdLines[cursor];
    if (!sectionLine || sectionLine.detail !== category.label) return null; // order assumption didn't hold — bail to flat fallback
    cursor += 1;
    lines.push({ detail: category.label, style: { type: "description", position: lines.length + 1 } });
    for (const item of category.items) {
      const itemLine = createdLines[cursor];
      if (!itemLine || itemLine.detail !== item.label) return null;
      cursor += 1;
      lines.push({
        detail: item.label,
        action: "sell",
        quantity: 1,
        amount: 0,
        vat_percent: 2000,
        unity: "forfait",
        style: { type: "product", position: lines.length + 1, section_id: sectionLine.id },
      });
    }
  }
  return lines;
}

export type CreateDraftQuoteResult = {
  quoteId: string;
  organizationId: number;
  nested: boolean;
};

/**
 * Creates a draft quote for `clientName` with the given categorized line
 * items. Tries to nest product lines under category headers (section_id)
 * in a second call once real line ids are known; falls back to a flat
 * (still perfectly usable, just visually ungrouped) quote if that
 * assumption about Sinao's response shape doesn't hold.
 */
export async function createDraftQuote(params: {
  clientName: string;
  knownOrganizationId: string | null;
  title: string;
  categories: SinaoQuoteCategory[];
}): Promise<CreateDraftQuoteResult> {
  const { clientName, knownOrganizationId, title, categories } = params;

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
    body: JSON.stringify({
      contact_infos,
      title,
      content: buildFlatContent(categories),
    }),
  });

  const resolvedOrganizationId: number = created?.contact_infos?.id ?? organizationId;
  const createdLines: { id: number; detail: string }[] = (created?.content ?? []).map((l: { id: number; detail: string }) => ({
    id: l.id,
    detail: l.detail,
  }));

  const nestedContent = buildNestedContent(categories, createdLines);
  if (nestedContent) {
    try {
      await sinaoFetch(`/quotes/${created.id}`, {
        method: "POST",
        body: JSON.stringify({ content: nestedContent }),
      });
      return { quoteId: String(created.id), organizationId: resolvedOrganizationId, nested: true };
    } catch {
      // Nesting attempt failed — the flat quote created above still stands and is usable.
    }
  }

  return { quoteId: String(created.id), organizationId: resolvedOrganizationId, nested: false };
}
