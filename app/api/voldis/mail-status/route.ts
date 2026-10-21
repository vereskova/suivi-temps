import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { mailConfigured, mailSenderAddress } from "@/lib/voldis/mail";

// Indique à l'onglet Réglages si l'envoi d'e-mails (SMTP) est configuré sur le serveur (rh_admin).
export async function GET() {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  return NextResponse.json({ configured: mailConfigured(), sender: mailSenderAddress() });
}
