import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { mailConfigured, sendMail } from "@/lib/voldis/mail";
import { monthLabelFr, num, remaining, round2, type VCharge, type VSettings, type VTenant } from "@/lib/voldis/rental";

// Relance de paiement : un e-mail au locataire qui liste ses loyers impayés (rh_admin). Body : { tenantId }.
export async function POST(req: Request) {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;
  if (!mailConfigured()) {
    return NextResponse.json({ error: "L'envoi d'e-mails n'est pas configuré (boîte OVH ou VOLDIS_SMTP_*)." }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as { tenantId?: string } | null;
  if (!body?.tenantId) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });

  const [{ data: tenant }, { data: cfg }, { data: charges }] = await Promise.all([
    supabase.from("voldis_tenants").select("*").eq("id", body.tenantId).maybeSingle<VTenant>(),
    supabase.from("voldis_settings").select("*").eq("id", 1).maybeSingle<VSettings>(),
    supabase.from("voldis_charges").select("*").eq("tenant_id", body.tenantId).eq("kind", "rent").neq("status", "paid").neq("status", "lost").lte("due_date", new Date().toISOString().slice(0, 10)).order("due_date"),
  ]);
  if (!tenant || !cfg) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const open = ((charges ?? []) as VCharge[]).filter((c) => remaining(c) > 0);
  if (open.length === 0) return NextResponse.json({ error: "Aucun impayé pour ce locataire." }, { status: 400 });
  const to = (tenant.billing_email ?? tenant.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Aucune adresse e-mail valable pour ce locataire : renseignez-la sur sa fiche." }, { status: 400 });
  }
  const total = round2(open.reduce((s, c) => s + remaining(c), 0));
  const fmt = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const list = open.map((c) => `- loyer ${monthLabelFr(c.period_start ?? c.due_date)} : ${fmt(remaining(c))} (échéance ${c.due_date.split("-").reverse().join("/")})`).join("\n");
  const text = `Bonjour,\n\nSauf erreur de notre part, les sommes suivantes restent dues :\n\n${list}\n\nTotal : ${fmt(total)}\n\nMerci de bien vouloir procéder au règlement dans les meilleurs délais${cfg.iban ? ` (IBAN : ${cfg.iban})` : ""}. Si le paiement vient d'être effectué, merci de ne pas tenir compte de ce message.\n\nCordialement,\n${cfg.company_name}`;
  try {
    await sendMail({ fromName: cfg.company_name, fromEmail: cfg.email, to, subject: `Rappel de paiement - ${cfg.company_name}`, text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Échec de l'envoi" }, { status: 502 });
  }
  await supabase.from("voldis_charges").update({ reminded_at: new Date().toISOString() }).in("id", open.map((c) => c.id));
  return NextResponse.json({ to, count: open.length, total: num(total) });
}
