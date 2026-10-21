/**
 * VOLDIS — client Powens (agrégation bancaire DSP2) : connexion du compte Crédit Agricole
 * et récupération des opérations. Réservé au serveur (utilise le service_role et les secrets).
 *
 * Variables d'environnement : POWENS_DOMAIN (ex. « voldis »), POWENS_CLIENT_ID,
 * POWENS_CLIENT_SECRET. Le jeton utilisateur permanent est stocké dans voldis_powens_link.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { toRows, type ParsedTx } from "./bank-import";

export const powensConfigured = () =>
  !!process.env.POWENS_DOMAIN && !!process.env.POWENS_CLIENT_ID && !!process.env.POWENS_CLIENT_SECRET;

const base = () => `https://${process.env.POWENS_DOMAIN}.biapi.pro/2.0`;

export function serviceDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role non configuré");
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(path.startsWith("http") ? path : `${base()}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Powens ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type PowensLink = { id: string; powens_user_id: number; access_token: string; last_sync_at: string | null; last_error: string | null };

export async function getLink(db: SupabaseClient): Promise<PowensLink | null> {
  const { data } = await db.from("voldis_powens_link").select("*").order("created_at").limit(1).maybeSingle();
  return (data as PowensLink | null) ?? null;
}

/** Crée (une seule fois) l'utilisateur Powens de VOLDIS avec un jeton permanent. */
export async function ensureLink(db: SupabaseClient): Promise<PowensLink> {
  const existing = await getLink(db);
  if (existing) return existing;
  const init = await call<{ auth_token: string; id_user: number }>("/auth/init", {
    method: "POST",
    body: JSON.stringify({ client_id: process.env.POWENS_CLIENT_ID, client_secret: process.env.POWENS_CLIENT_SECRET }),
  });
  const { data, error } = await db
    .from("voldis_powens_link")
    .insert({ powens_user_id: init.id_user, access_token: init.auth_token })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PowensLink;
}

/** Lien de connexion (webview Powens) vers lequel envoyer l'utilisatrice pour (re)lier la banque. */
export async function connectUrl(link: PowensLink, redirectUri: string): Promise<string> {
  const code = await call<{ code: string }>("/auth/token/code?type=singleAccess", { token: link.access_token });
  const qs = new URLSearchParams({
    domain: process.env.POWENS_DOMAIN!,
    client_id: process.env.POWENS_CLIENT_ID!,
    redirect_uri: redirectUri,
    code: code.code,
  });
  return `https://webview.powens.com/connect?${qs}`;
}

type PowensAccount = { id: number; name?: string; original_name?: string; iban?: string | null; balance?: number | null; disabled?: string | null };
type PowensTx = {
  id: number;
  id_account: number;
  date: string;
  value: number | null;
  wording?: string | null;
  original_wording?: string | null;
  coming?: boolean;
  deleted?: string | null;
};
type PowensConnection = { id: number; state?: string | null; last_update?: string | null; connector?: { name?: string } };

export async function connectionStates(link: PowensLink): Promise<{ id: number; state: string | null; bank: string | null; lastUpdate: string | null }[]> {
  const res = await call<{ connections: PowensConnection[] }>("/users/me/connections", { token: link.access_token });
  return (res.connections ?? []).map((c) => ({ id: c.id, state: c.state ?? null, bank: c.connector?.name ?? null, lastUpdate: c.last_update ?? null }));
}

/**
 * Récupère les opérations (par défaut : 60 derniers jours ; `fullHistory` : tout ce que la banque donne)
 * et les ajoute à voldis_bank_transactions. Même clé de dédoublonnage que l'import de fichier :
 * rien n'est dupliqué avec l'historique Rentila ni avec les relevés importés à la main.
 */
export async function syncTransactions(db: SupabaseClient, link: PowensLink, opts: { fullHistory?: boolean } = {}): Promise<{ fetched: number; added: number }> {
  const accounts = await call<{ accounts: PowensAccount[] }>("/users/me/accounts", { token: link.access_token });
  const byId = new Map((accounts.accounts ?? []).map((a) => [a.id, a]));

  const minDate = opts.fullHistory ? null : new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const txs: PowensTx[] = [];
  let next: string | null = `/users/me/transactions?limit=1000${minDate ? `&min_date=${minDate}` : ""}`;
  for (let guard = 0; next && guard < 50; guard++) {
    const page: { transactions: PowensTx[]; _links?: { next?: { href?: string } | null } } = await call(next, { token: link.access_token });
    txs.push(...(page.transactions ?? []));
    const href: string | undefined = page._links?.next?.href;
    next = href ? (href.startsWith("http") ? href : `${base()}${href.startsWith("/") ? "" : "/"}${href}`) : null;
  }

  const posted = txs.filter((t) => !t.coming && !t.deleted && t.value !== null);
  const rows = posted.map((t) => {
    const acc = byId.get(t.id_account);
    const parsed: ParsedTx = { date: t.date, amount: Number(t.value), label: (t.original_wording ?? t.wording ?? "").replace(/\s+/g, " ").trim() };
    return { parsed, account: acc };
  });

  let added = 0;
  // un lot par compte pour que le suffixe #n de doublons reste cohérent
  const groups = new Map<number | undefined, typeof rows>();
  rows.forEach((r) => groups.set(r.account?.id, [...(groups.get(r.account?.id) ?? []), r]));
  for (const group of groups.values()) {
    const acc = group[0].account;
    const toInsert = toRows(group.map((g) => g.parsed), "powens").map((r) => ({
      ...r,
      bank_account: acc?.name ?? acc?.original_name ?? null,
      iban: acc?.iban ?? null,
    }));
    const ids = toInsert.map((r) => r.external_id);
    const { data: known } = await db.from("voldis_bank_transactions").select("external_id").in("external_id", ids);
    const knownSet = new Set((known ?? []).map((k) => k.external_id as string));
    const fresh = toInsert.filter((r) => !knownSet.has(r.external_id));
    if (fresh.length > 0) {
      const { error } = await db.from("voldis_bank_transactions").upsert(fresh, { onConflict: "external_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      added += fresh.length;
    }
  }
  await db.from("voldis_powens_link").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", link.id);
  return { fetched: posted.length, added };
}
