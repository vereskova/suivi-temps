import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { connectUrl, ensureLink, powensConfigured, serviceDb } from "@/lib/voldis/powens";

// Démarre (ou renouvelle) la liaison du compte Crédit Agricole : renvoie l'URL de la page Powens
// où l'utilisatrice se connecte à sa banque (le mot de passe bancaire ne passe jamais par nous).
export async function POST(req: Request) {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  if (!powensConfigured()) {
    return NextResponse.json({ error: "POWENS_DOMAIN, POWENS_CLIENT_ID et POWENS_CLIENT_SECRET ne sont pas définis sur le serveur." }, { status: 400 });
  }
  try {
    const link = await ensureLink(serviceDb());
    const redirect = `${new URL(req.url).origin}/api/voldis/powens/callback`;
    return NextResponse.json({ url: await connectUrl(link, redirect), redirect });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur Powens" }, { status: 502 });
  }
}
