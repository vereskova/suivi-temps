import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { VOLDIS_LOCATION_ROLES } from "@/lib/voldis/access";
import { renderInvoicePdf } from "@/lib/voldis/invoice-pdf";
import { VOLDIS_CC, mailConfigured, parseEmails, sendMail } from "@/lib/voldis/mail";
import { monthLabelFr, type VInvoice, type VSettings, type VTenant } from "@/lib/voldis/rental";

// Envoi par e-mail d'une facture / quittance au locataire (rh_admin + comptable). Body optionnel : { to }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole(VOLDIS_LOCATION_ROLES);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;
  const { id } = await params;

  if (!mailConfigured()) {
    return NextResponse.json(
      { error: "L'envoi d'e-mails n'est pas configuré (boîte OVH ou VOLDIS_SMTP_*)." },
      { status: 400 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const { data: invoice } = await supabase.from("voldis_invoices").select("*").eq("id", id).maybeSingle<VInvoice>();
  if (!invoice) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const [{ data: cfg }, { data: tenant }] = await Promise.all([
    supabase.from("voldis_settings").select("*").eq("id", 1).maybeSingle<VSettings>(),
    invoice.tenant_id ? supabase.from("voldis_tenants").select("*").eq("id", invoice.tenant_id).maybeSingle<VTenant>() : Promise.resolve({ data: null }),
  ]);
  if (!cfg) return NextResponse.json({ error: "Fiche société introuvable" }, { status: 500 });

  const { valid: toList, invalid } = parseEmails(body.to ?? tenant?.billing_email ?? tenant?.email ?? "");
  if (toList.length === 0 || invalid.length > 0) {
    return NextResponse.json({ error: invalid.length ? `Adresse e-mail non valable : ${invalid.join(", ")}` : "Aucune adresse e-mail valable pour ce locataire : renseignez-la sur sa fiche." }, { status: 400 });
  }
  const to = toList.join(", ");
  const cc = VOLDIS_CC.filter((a) => !toList.some((t) => t.toLowerCase() === a.toLowerCase()));

  let bytes: Buffer | null = null;
  if (invoice.pdf_path) {
    const { data } = await supabase.storage.from("voldis-documents").download(invoice.pdf_path);
    if (data) bytes = Buffer.from(await data.arrayBuffer());
  }
  if (!bytes) bytes = await renderInvoicePdf(cfg, tenant, invoice);

  const period = monthLabelFr(invoice.period_start ?? invoice.issue_date);
  const isReceipt = invoice.kind === "receipt";
  const subject = isReceipt ? `Quittance de loyer ${period} - ${cfg.company_name}` : `Facture ${invoice.number} - loyer ${period} - ${cfg.company_name}`;
  const text = isReceipt
    ? `Bonjour,\n\nVeuillez trouver ci-joint la quittance de loyer pour ${period}.\n\nCordialement,\n${cfg.company_name}`
    : `Bonjour,\n\nVeuillez trouver ci-joint la facture ${invoice.number} relative au loyer de ${period}, d'un montant de ${invoice.total_ttc.toFixed(2).replace(".", ",")} €.\n${cfg.payment_terms}${cfg.iban ? `\nIBAN : ${cfg.iban}` : ""}\n\nCordialement,\n${cfg.company_name}`;

  try {
    await sendMail({ fromName: cfg.company_name, fromEmail: cfg.email, to, cc, subject, text, attachments: [{ filename: `${invoice.number}.pdf`, content: bytes }] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de l'envoi" }, { status: 502 });
  }
  const { data: updated } = await supabase
    .from("voldis_invoices")
    .update({ status: "sent", sent_at: new Date().toISOString(), sent_to: to })
    .eq("id", id)
    .select("*")
    .single();
  return NextResponse.json({ invoice: updated, to });
}
