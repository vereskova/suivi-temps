import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { renderInvoicePdf } from "@/lib/voldis/invoice-pdf";
import {
  buildInvoiceLines,
  nextInvoiceNumber,
  num,
  round2,
  totalsOf,
  type InvoiceLine,
  type VCharge,
  type VInvoice,
  type VLease,
  type VSettings,
  type VTenant,
} from "@/lib/voldis/rental";

const BUCKET = "voldis-documents";

/**
 * Crée la facture (appel de loyer) ou la quittance d'une échéance, génère le PDF et le range dans le stockage privé.
 * Une seule facture et une seule quittance « actives » par échéance : si elle existe déjà, on la renvoie.
 * Body : { chargeId, kind: "invoice" | "receipt" }.
 */
export async function POST(req: Request) {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;

  const body = (await req.json().catch(() => null)) as { chargeId?: string; kind?: "invoice" | "receipt" } | null;
  if (!body?.chargeId || (body.kind !== "invoice" && body.kind !== "receipt")) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("voldis_invoices")
    .select("*")
    .eq("charge_id", body.chargeId)
    .eq("kind", body.kind)
    .neq("status", "void")
    .maybeSingle();
  if (existing) return NextResponse.json({ invoice: existing, existing: true });

  const { data: charge } = await supabase.from("voldis_charges").select("*").eq("id", body.chargeId).maybeSingle<VCharge>();
  if (!charge) return NextResponse.json({ error: "Échéance introuvable" }, { status: 404 });
  if (body.kind === "receipt" && num(charge.amount_paid) <= 0) {
    return NextResponse.json({ error: "Aucun encaissement sur cette échéance : pas de quittance possible." }, { status: 400 });
  }

  const [{ data: lease }, { data: tenant }, { data: cfg }] = await Promise.all([
    charge.lease_id ? supabase.from("voldis_leases").select("*").eq("id", charge.lease_id).maybeSingle<VLease>() : Promise.resolve({ data: null }),
    charge.tenant_id ? supabase.from("voldis_tenants").select("*").eq("id", charge.tenant_id).maybeSingle<VTenant>() : Promise.resolve({ data: null }),
    supabase.from("voldis_settings").select("*").eq("id", 1).maybeSingle<VSettings>(),
  ]);
  if (!cfg) return NextResponse.json({ error: "Fiche société introuvable (migration 0118 ?)" }, { status: 500 });

  let lines: InvoiceLine[] = buildInvoiceLines(charge, lease);
  if (body.kind === "receipt" && Math.abs(num(charge.amount_paid) - num(charge.amount_due)) > 0.01) {
    // encaissement partiel ou trop-perçu : une ligne unique pour le montant réellement reçu
    const paid = round2(num(charge.amount_paid));
    const ratio = num(charge.amount_due) > 0 ? num(charge.vat_amount) / num(charge.amount_due) : 0;
    const vat = round2(paid * ratio);
    lines = [{ label: `${lines[0]?.label ?? "Loyer"} (montant encaissé)`, amount_ht: round2(paid - vat), vat_rate: lines[0]?.vat_rate ?? 0, vat, amount_ttc: paid }];
  }

  const prefix = body.kind === "receipt" ? cfg.receipt_prefix : cfg.invoice_prefix;
  const issueDate = body.kind === "receipt" ? (charge.paid_on ?? new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
  const year = Number(issueDate.slice(0, 4));
  const { data: numbers } = await supabase.from("voldis_invoices").select("number").like("number", `${prefix}-${year}-%`);
  const number = nextInvoiceNumber(prefix, year, (numbers ?? []).map((n) => n.number as string));

  const row = {
    number,
    kind: body.kind,
    tenant_id: charge.tenant_id,
    lease_id: charge.lease_id,
    charge_id: charge.id,
    issue_date: issueDate,
    due_date: body.kind === "invoice" ? charge.due_date : null,
    period_start: charge.period_start,
    period_end: charge.period_end,
    lines,
    ...totalsOf(lines),
    status: "draft" as const,
  };
  const { data: created, error } = await supabase.from("voldis_invoices").insert(row).select("*").single<VInvoice>();
  if (error || !created) return NextResponse.json({ error: error?.message ?? "Création impossible" }, { status: 500 });

  try {
    const pdf = await renderInvoicePdf(cfg, tenant, created);
    const path = `invoices/${created.number}.pdf`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: updated } = await supabase.from("voldis_invoices").update({ pdf_path: path }).eq("id", created.id).select("*").single();
    return NextResponse.json({ invoice: updated ?? created });
  } catch (e) {
    // pas de document sans PDF : on retire la ligne pour pouvoir réessayer
    await supabase.from("voldis_invoices").delete().eq("id", created.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur PDF" }, { status: 500 });
  }
}
