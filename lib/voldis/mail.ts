/**
 * VOLDIS — envoi d'e-mails (factures, quittances, relances) par SMTP.
 *
 * Par défaut, on réutilise la boîte OVH déjà connectée au projet (OVH_EMAIL_ADDRESS /
 * OVH_EMAIL_PASSWORD / OVH_IMAP_HOST : même serveur et mêmes identifiants pour l'envoi,
 * port 465). Pour utiliser une autre boîte, définir VOLDIS_SMTP_HOST, VOLDIS_SMTP_USER et
 * VOLDIS_SMTP_PASS (et VOLDIS_SMTP_PORT si ce n'est pas 465) : ils sont prioritaires.
 * Le nom affiché est celui de la société (« VOLDIS ») ; les réponses vont à l'adresse
 * de la fiche société (Réglages), à défaut à la boîte d'envoi.
 */
import nodemailer from "nodemailer";

type Smtp = { host: string; port: number; user: string; pass: string };

function smtpConfig(): Smtp | null {
  const e = process.env;
  if (e.VOLDIS_SMTP_HOST && e.VOLDIS_SMTP_USER && e.VOLDIS_SMTP_PASS) {
    return { host: e.VOLDIS_SMTP_HOST, port: Number(e.VOLDIS_SMTP_PORT ?? 465), user: e.VOLDIS_SMTP_USER, pass: e.VOLDIS_SMTP_PASS };
  }
  const host = e.OVH_SMTP_HOST ?? e.OVH_IMAP_HOST;
  if (host && e.OVH_EMAIL_ADDRESS && e.OVH_EMAIL_PASSWORD) {
    return { host, port: 465, user: e.OVH_EMAIL_ADDRESS, pass: e.OVH_EMAIL_PASSWORD };
  }
  return null;
}

export const mailConfigured = () => smtpConfig() !== null;

/** Adresse d'envoi réellement utilisée (affichée dans Réglages), sans le mot de passe. */
export const mailSenderAddress = () => smtpConfig()?.user ?? null;

export async function sendMail(opts: {
  fromName: string;
  fromEmail?: string | null;
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  const cfg = smtpConfig();
  if (!cfg) throw new Error("Envoi d'e-mails non configuré");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  await transport.sendMail({
    from: `"${opts.fromName.replace(/"/g, "")}" <${cfg.user}>`,
    replyTo: opts.fromEmail || cfg.user,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });
}
