import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export type PrevalyEmail = {
  uid: number;
  date: string | null;
  from: string;
  subject: string;
  snippet: string;
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

          let snippet = "";
          if (msg.source) {
            const parsed = await simpleParser(msg.source);
            snippet = (parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
          }

          results.push({
            uid,
            date: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : null,
            from: from || to,
            subject: msg.envelope.subject ?? "(sans objet)",
            snippet,
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
