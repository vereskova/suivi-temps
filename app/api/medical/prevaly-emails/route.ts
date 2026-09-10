import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { fetchPrevalyEmails, matchEmployeeByName, parseConvocation } from "@/lib/email/prevalyMail";

export async function GET() {
  const check = await requireRole(["rh_admin", "rh"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;

  let emails;
  try {
    emails = await fetchPrevalyEmails(60);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de connexion à la boîte mail" },
      { status: 500 }
    );
  }

  // Only "Convocation" e-mails have a fixed, reliably parseable layout — the
  // rest of the correspondence is never auto-applied to medical_visits.
  const convocations = emails
    .map((email) => ({ email, parsed: parseConvocation(email.text) }))
    .filter((c): c is { email: (typeof emails)[number]; parsed: NonNullable<ReturnType<typeof parseConvocation>> } => !!c.parsed);

  const applied: { employeeName: string; date: string; time: string }[] = [];
  const unmatched: string[] = [];

  if (convocations.length > 0) {
    const [{ data: employees }, { data: existingVisits }] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name"),
      supabase
        .from("medical_visits")
        .select("id, employee_id, next_visit_source, next_visit_source_at"),
    ]);

    const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
    const visitByEmployeeId = new Map((existingVisits ?? []).map((v) => [v.employee_id, v]));

    for (const { email, parsed } of convocations) {
      const employeeId = matchEmployeeByName(parsed.nameLine, employees ?? []);
      if (!employeeId) {
        unmatched.push(parsed.nameLine);
        continue;
      }
      const existing = visitByEmployeeId.get(employeeId);
      const emailIsNewer = !existing?.next_visit_source_at || (email.date ?? "") > existing.next_visit_source_at;

      if (existing && existing.next_visit_source === "manual") {
        continue; // never overwrite a hand-entered date
      }
      if (existing && !emailIsNewer) {
        continue; // already applied this (or a more recent) convocation
      }

      const payload = {
        next_visit_date: parsed.dateIso,
        next_visit_time: parsed.time,
        next_visit_source: "email" as const,
        next_visit_source_at: email.date,
        next_visit_source_subject: email.subject,
      };

      const { error } = existing
        ? await supabase.from("medical_visits").update(payload).eq("id", existing.id)
        : await supabase.from("medical_visits").insert({ employee_id: employeeId, ...payload });

      if (!error) {
        const emp = employeeById.get(employeeId);
        applied.push({
          employeeName: emp ? `${emp.last_name} ${emp.first_name}` : parsed.nameLine,
          date: parsed.dateIso,
          time: parsed.time,
        });
      }
    }
  }

  return NextResponse.json({
    emails: emails.map(({ uid, date, from, subject, snippet }) => ({ uid, date, from, subject, snippet })),
    convocations: { applied, unmatched },
  });
}
