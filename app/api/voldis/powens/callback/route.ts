import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { getLink, powensConfigured, serviceDb, syncTransactions } from "@/lib/voldis/powens";

// Retour de la page Powens après la connexion bancaire : première synchro complète, puis retour à l'admin.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${url.origin}/admin?voldis_bank=${q}`);
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  if (!powensConfigured() || url.searchParams.get("error")) return back("error");
  try {
    const db = serviceDb();
    const link = await getLink(db);
    if (!link) return back("error");
    await syncTransactions(db, link, { fullHistory: true });
    return back("ok");
  } catch {
    return back("error");
  }
}
