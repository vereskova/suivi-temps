import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { emailMentionsEmployee, fetchPrevalyEmails } from "@/lib/email/prevalyMail";

// Read-only correspondence history for one employee: unlike the convocation
// auto-fill (fixed layout, auto-applied), this covers ALL Prevaly e-mails —
// free-text ones included — matched by a loose "both name tokens appear
// somewhere in the message" search, purely for RH to read on demand.
export async function GET(request: NextRequest) {
  const check = await requireRole(["rh_admin", "rh"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;

  const employeeId = request.nextUrl.searchParams.get("employeeId");
  if (!employeeId) {
    return NextResponse.json({ error: "Missing employeeId" }, { status: 400 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("first_name, last_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) {
    return NextResponse.json({ error: "Salarié introuvable" }, { status: 404 });
  }

  let emails;
  try {
    emails = await fetchPrevalyEmails(120);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de connexion à la boîte mail" },
      { status: 500 }
    );
  }

  const matches = emails
    .filter((e) => emailMentionsEmployee(e, employee.first_name, employee.last_name))
    .map(({ uid, date, from, subject, snippet }) => ({ uid, date, from, subject, snippet }));

  return NextResponse.json({ emails: matches });
}
