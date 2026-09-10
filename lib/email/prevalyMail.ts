import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type PrevalyEmail = {
  // Only unique within one mailbox of one account — use array index (or
  // uid+account) as the React key, never uid alone, once more than one
  // account/mailbox is merged.
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

type MailAccount = { host: string; user: string; pass: string };

/** assistant@vladis.fr holds the back-and-forth correspondence; the
 *  convocation e-mails themselves land in contact@vladis.fr — a second,
 *  separate OVH mailbox (its own IMAP login AND its own mail cluster
 *  hostname, not an alias), so both are read when configured. Only the
 *  first account is required. */
function getAccounts(): MailAccount[] {
  const accounts: MailAccount[] = [];
  if (process.env.OVH_IMAP_HOST && process.env.OVH_EMAIL_ADDRESS && process.env.OVH_EMAIL_PASSWORD) {
    accounts.push({
      host: process.env.OVH_IMAP_HOST,
      user: process.env.OVH_EMAIL_ADDRESS,
      pass: process.env.OVH_EMAIL_PASSWORD,
    });
  }
  if (
    process.env.OVH_CONTACT_IMAP_HOST &&
    process.env.OVH_CONTACT_EMAIL_ADDRESS &&
    process.env.OVH_CONTACT_EMAIL_PASSWORD
  ) {
    accounts.push({
      host: process.env.OVH_CONTACT_IMAP_HOST,
      user: process.env.OVH_CONTACT_EMAIL_ADDRESS,
      pass: process.env.OVH_CONTACT_EMAIL_PASSWORD,
    });
  }
  return accounts;
}

async function fetchFromAccount(account: MailAccount, since: Date): Promise<PrevalyEmail[]> {
  const client = new ImapFlow({
    host: account.host,
    port: 993,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });

  const results: PrevalyEmail[] = [];
  await client.connect();
  try {
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
  return results;
}

/**
 * Reads the OVH mailbox(es) (credentials in .env.local, never hardcoded) and
 * returns every message to/from Prevaly/Padoa within the last `days` days —
 * both sides of the correspondence, so a reply she sent shows up too.
 */
export async function fetchPrevalyEmails(days: number): Promise<PrevalyEmail[]> {
  const accounts = getAccounts();
  if (accounts.length === 0) {
    throw new Error("OVH_IMAP_HOST / OVH_EMAIL_ADDRESS / OVH_EMAIL_PASSWORD manquants dans .env.local");
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const perAccount = await Promise.all(accounts.map((account) => fetchFromAccount(account, since)));
  const results = perAccount.flat();

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

export type ConvocationEvent = {
  type: "convocation" | "annulation";
  nameLine: string;
  dateIso: string | null;
  time: string | null;
};

/**
 * Prevaly sends three kinds of "... convocation santé au travail : NAME avec
 * DOCTOR" e-mails — a first convocation, a "RAPPEL" reminder (same layout),
 * and an "ANNULATION" cancellation (a different, simpler layout, no date
 * needed since the appointment no longer stands) — always with that exact
 * subject shape, which is far more reliable to parse than the body: the
 * HTML body's line breaks collapse unpredictably depending on which mail
 * client rendered it, but the subject line never does.
 *
 * The body is only used for the appointment date/time, using "Le ..." for a
 * (re)convocation or "Du ..." for a cancellation notice.
 */
export function parseConvocationEmail(subject: string, text: string): ConvocationEvent | null {
  const nameMatch = subject.match(/convocation\s+sant[ée]\s+au\s+travail\s*:\s*(.+?)\s+avec\s+/i);
  if (!nameMatch) return null;
  const nameLine = nameMatch[1].trim();
  if (!nameLine) return null;

  const isAnnulation = /annulation/i.test(subject);
  if (isAnnulation) {
    return { type: "annulation", nameLine, dateIso: null, time: null };
  }

  const dateMatch = text.match(/Le\s+\S+\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})\s+à\s+(\d{1,2})[:h](\d{2})/i);
  if (!dateMatch) return { type: "convocation", nameLine, dateIso: null, time: null };
  const [, dayStr, monthName, yearStr, hourStr, minuteStr] = dateMatch;
  const month = FR_MONTHS[monthName.toLowerCase()];
  if (!month) return { type: "convocation", nameLine, dateIso: null, time: null };

  return {
    type: "convocation",
    nameLine,
    dateIso: `${yearStr}-${String(month).padStart(2, "0")}-${dayStr.padStart(2, "0")}`,
    time: `${hourStr.padStart(2, "0")}:${minuteStr}`,
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
