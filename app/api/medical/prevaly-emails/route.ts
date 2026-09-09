import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { fetchPrevalyEmails } from "@/lib/email/prevalyMail";

export async function GET() {
  const check = await requireRole(["rh_admin", "rh"]);
  if (!check.ok) return check.response;

  try {
    const emails = await fetchPrevalyEmails(60);
    return NextResponse.json({ emails });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de connexion à la boîte mail" },
      { status: 500 }
    );
  }
}
