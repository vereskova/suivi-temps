import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { VOLDIS_LOCATION_ROLES } from "@/lib/voldis/access";
import { getLink, powensConfigured, serviceDb, syncTransactions } from "@/lib/voldis/powens";

// Synchronisation à la demande (bouton « Synchroniser » de l'onglet Banque), rh_admin + comptable.
export async function POST() {
  const check = await requireRole(VOLDIS_LOCATION_ROLES);
  if (!check.ok) return check.response;
  if (!powensConfigured()) return NextResponse.json({ error: "Powens n'est pas configuré sur le serveur." }, { status: 400 });
  try {
    const db = serviceDb();
    const link = await getLink(db);
    if (!link) return NextResponse.json({ error: "Aucune banque liée : cliquez d'abord sur « Connecter Crédit Agricole »." }, { status: 400 });
    return NextResponse.json(await syncTransactions(db, link));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur Powens" }, { status: 502 });
  }
}
