import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type PrevalyEmail = {
  uid: number;
  date: string | null;
  from: string;
  subject: string;
  snippet: string;
  text: string;
};

const PREVALY_DOMAINS = ["prevaly.fr", "prevaly.padoa.fr", "padoa.fr"];

function looksLikePrevaly(address: string | undefined): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  return PREVALY_DOMAINS.some((d) => lower.includes(d));
}

/**
 * Reads the OVH mailbox (credentials in .env.local, never hardcoded) and
 * returns every message to/from Prevaly/Padoa within the last `days` days —
 * both sides of the correspondence, so a reply she sent shows up too.
 */
export async function fetchPrevalyEmails(days: number): Promise<PrevalyEmail[]> {
  const host = process.env.OVH_IMAP_HOST;
  const user = process.env.OVH_EMAIL_ADDRESS;
  const pass = process.env.OVH_EMAIL_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error("OVH_IMAP_HOST / OVH_EMAIL_ADDRESS / OVH_EMAIL_PASSWORD manquants dans .env.local");
  }

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const results: PrevalyEmail[] = [];
  await client.connect();
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    for (const mailbox of ["INBOX", "INBOX.Sent Messages"]) {
      let lock;
      try {
        lock = await client.getMailboxLock(mailbox);
      } catch {
        continue; // mailbox doesn't exist under this name on this account
      }
      try {
        // Ask the IMAP server to pre-filter by sender/recipient domain —
        // fetching the full source of every message in the window (then
        // discarding most of them) was slow enough to blow Vercel's function
        // timeout, even though it ran fine against a plain local script.
        const domainFilter = { or: [{ from: "prevaly.fr" }, { from: "padoa.fr" }] };
        const recipientFilter = { or: [{ to: "prevaly.fr" }, { to: "padoa.fr" }] };
        const uids = await client.search({
          since,
          or: [domainFilter, recipientFilter],
        });
        for (const uid of uids || []) {
          const msg = await client.fetchOne(uid, { envelope: true, source: true });
          if (!msg || !msg.envelope) continue;
          const from = msg.envelope.from?.[0]?.address ?? "";
          const to = (msg.envelope.to ?? []).map((t) => t.address ?? "").join(",");
          if (!looksLikePrevaly(from) && !looksLikePrevaly(to)) continue;

          let text = "";
          if (msg.source) {
            const parsed = await simpleParser(msg.source);
            text = (parsed.text ?? "").replace(/\r\n/g, "\n");
          }

          results.push({
            uid,
            date: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : null,
            from: from || to,
            subject: msg.envelope.subject ?? "(sans objet)",
            snippet: text.replace(/\s+/g, " ").trim().slice(0, 240),
            text,
          });
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => client.close());
  }

  results.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return results;
}

const FR_MONTHS: Record<string, number> = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};

export type ParsedConvocation = {
  nameLine: string;
  dateIso: string;
  time: string;
};

/**
 * Prevaly's "Convocation pour une visite de santé au travail" e-mails always
 * use the same fixed layout (unlike the rest of the correspondence, which is
 * free text and never auto-applied): a "Convocation" heading, the employee's
 * name, "(né(e) le ...)", then "Le <jour> <D> <mois> <YYYY> à <HH:MM>". Only
 * that one message type is parsed automatically.
 */
export function parseConvocation(text: string): ParsedConvocation | null {
  const nameMatch = text.match(/Convocation\s*\n+\s*([^\n(]+?)\s*\n+\s*\(n[ée]\(e\)\s*le/i);
  if (!nameMatch) return null;
  const nameLine = nameMatch[1].trim();
  if (!nameLine) return null;

  const dateMatch = text.match(
    /Le\s+\S+\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})\s+à\s+(\d{1,2})[:h](\d{2})/i
  );
  if (!dateMatch) return null;
  const [, dayStr, monthName, yearStr, hourStr, minuteStr] = dateMatch;
  const month = FR_MONTHS[monthName.toLowerCase()];
  if (!month) return null;

  const day = dayStr.padStart(2, "0");
  const monthStr = String(month).padStart(2, "0");
  const hour = hourStr.padStart(2, "0");

  return {
    nameLine,
    dateIso: `${yearStr}-${monthStr}-${day}`,
    time: `${hour}:${minuteStr}`,
  };
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Matches a free-form name line (order/case/accents unknown) against the
 * employee roster. Returns the employee id, or null if no exact token-set
 * match is found — ambiguous or partial matches are left for RH to resolve
 * by hand rather than guessed.
 */
export function matchEmployeeByName(
  nameLine: string,
  employees: { id: string; first_name: string; last_name: string }[]
): string | null {
  const target = normalizeName(nameLine);
  if (!target) return null;
  const match = employees.find((e) => normalizeName(`${e.first_name} ${e.last_name}`) === target);
  return match?.id ?? null;
}

/** Loose full-text search used only to surface correspondence history for
 *  one employee (a read-only convenience) — both name tokens must appear
 *  somewhere in the message, in any order. */
export function emailMentionsEmployee(email: PrevalyEmail, firstName: string, lastName: string): boolean {
  const haystack = normalizeName(`${email.subject} ${email.text}`);
  const first = normalizeName(firstName);
  const last = normalizeName(lastName);
  if (!first || !last) return false;
  const tokens = new Set(haystack.split(" "));
  return first.split(" ").every((t) => tokens.has(t)) && last.split(" ").every((t) => tokens.has(t));
}
