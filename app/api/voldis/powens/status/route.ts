import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { connectionStates, getLink, powensConfigured, serviceDb } from "@/lib/voldis/powens";

// État de la synchronisation bancaire VOLDIS (rh_admin) : configurée ? banque liée ? reconnexion nécessaire ?
export async function GET() {
  const check = await requireRole(["rh_admin"]);
  if (!check.ok) return check.response;
  if (!powensConfigured()) return NextResponse.json({ configured: false, connected: false });
  try {
    const link = await getLink(serviceDb());
    if (!link) return NextResponse.json({ configured: true, connected: false });
    const connections = await connectionStates(link);
    return NextResponse.json({ configured: true, connected: connections.length > 0, lastSync: link.last_sync_at, connections });
  } catch (e) {
    return NextResponse.json({ configured: true, connected: false, error: e instanceof Error ? e.message : "Erreur Powens" });
  }
}
