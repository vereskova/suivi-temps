import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { renderInvoicePdf } from "@/lib/voldis/invoice-pdf";
import type { VInvoice, VSettings, VTenant } from "@/lib/voldis/rental";

// Téléchargement du PDF d'une facture / quittance (rh_admin). Régénéré à la volée si le fichier stocké manque.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;
  const { id } = await params;

  const { data: invoice } = await supabase.from("voldis_invoices").select("*").eq("id", id).maybeSingle<VInvoice>();
  if (!invoice) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  let bytes: Buffer | null = null;
  if (invoice.pdf_path) {
    const { data } = await supabase.storage.from("voldis-documents").download(invoice.pdf_path);
    if (data) bytes = Buffer.from(await data.arrayBuffer());
  }
  if (!bytes) {
    const [{ data: cfg }, { data: tenant }] = await Promise.all([
      supabase.from("voldis_settings").select("*").eq("id", 1).maybeSingle<VSettings>(),
      invoice.tenant_id ? supabase.from("voldis_tenants").select("*").eq("id", invoice.tenant_id).maybeSingle<VTenant>() : Promise.resolve({ data: null }),
    ]);
    if (!cfg) return NextResponse.json({ error: "Fiche société introuvable" }, { status: 500 });
    bytes = await renderInvoicePdf(cfg, tenant, invoice);
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${invoice.number}.pdf"` },
  });
}
