import { NextResponse } from "next/server";
import { getLink, powensConfigured, serviceDb, syncTransactions } from "@/lib/voldis/powens";

// Synchronisation quotidienne automatique (Vercel Cron, voir vercel.json). Vercel envoie
// « Authorization: Bearer <CRON_SECRET> » ; sans CRON_SECRET défini, la route reste fermée.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!powensConfigured()) return NextResponse.json({ skipped: "not configured" });
  const db = serviceDb();
  const link = await getLink(db);
  if (!link) return NextResponse.json({ skipped: "no bank linked" });
  try {
    return NextResponse.json(await syncTransactions(db, link));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Powens";
    await db.from("voldis_powens_link").update({ last_error: message }).eq("id", link.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
