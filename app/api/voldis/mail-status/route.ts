import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { VOLDIS_LOCATION_ROLES } from "@/lib/voldis/access";
import { mailConfigured, mailSenderAddress } from "@/lib/voldis/mail";

// Indique à l'onglet Réglages si l'envoi d'e-mails (SMTP) est configuré sur le serveur (rh_admin + comptable).
export async function GET() {
  const check = await requireRole(VOLDIS_LOCATION_ROLES);
  if (!check.ok) return check.response;
  return NextResponse.json({ configured: mailConfigured(), sender: mailSenderAddress() });
}
