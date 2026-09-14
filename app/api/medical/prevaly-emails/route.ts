import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  ConvocationEvent,
  PrevalyEmail,
  fetchPrevalyEmails,
  matchEmployeeByName,
  parseAptitudeEmail,
  parseConvocationEmail,
} from "@/lib/email/prevalyMail";

export async function GET() {
  const check = await requireRole(["rh_admin", "rh"]);
  if (!check.ok) return check.response;
  const { supabase } = check.ctx;

  let emails: PrevalyEmail[];
  try {
    emails = await fetchPrevalyEmails(60);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de connexion à la boîte mail" },
      { status: 500 }
    );
  }

  // Convocation/RAPPEL/ANNULATION e-mails share one fixed subject shape —
  // the rest of the correspondence is free text and never auto-applied.
  const events = emails
    .map((email) => ({ email, event: parseConvocationEmail(email.subject, email.text) }))
    .filter((e): e is { email: PrevalyEmail; event: ConvocationEvent } => !!e.event);

  // "Aptitude" e-mails confirm a visit actually happened — the fitness
  // certificate itself lives behind a Prevaly employer-portal login (never
  // done automatically), so only the visit date is applied here; the
  // document link is surfaced for RH to fetch by hand (or hand to Claude
  // once logged in there).
  const aptitudeEvents = emails
    .map((email) => ({ email, event: parseAptitudeEmail(email.subject, email.text) }))
    .filter((e): e is { email: PrevalyEmail; event: NonNullable<ReturnType<typeof parseAptitudeEmail>> } => !!e.event);

  const applied: { employeeName: string; date: string | null; time: string | null; cancelled: boolean }[] = [];
  const unmatched: string[] = [];
  const unparsedDates: string[] = [];
  const visitsConfirmed: { employeeName: string; visitDate: string; documentUrl: string }[] = [];

  if (events.length > 0 || aptitudeEvents.length > 0) {
    const [{ data: employees }, { data: existingVisits }] = await Promise.all([
      supabase.from("employees").select("id, first_name, last_name"),
      supabase
        .from("medical_visits")
        .select("id, employee_id, last_visit_date, next_visit_source, next_visit_source_at"),
    ]);

    const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
    const visitByEmployeeId = new Map((existingVisits ?? []).map((v) => [v.employee_id, v]));

    for (const { event } of aptitudeEvents) {
      const employeeId = matchEmployeeByName(event.nameLine, employees ?? []);
      if (!employeeId) {
        unmatched.push(event.nameLine);
        continue;
      }
      const emp = employeeById.get(employeeId);
      const employeeName = emp ? `${emp.last_name} ${emp.first_name}` : event.nameLine;
      const existing = visitByEmployeeId.get(employeeId);
      if (!existing || !existing.last_visit_date || event.visitDateIso > existing.last_visit_date) {
        const { error } = existing
          ? await supabase.from("medical_visits").update({ last_visit_date: event.visitDateIso }).eq("id", existing.id)
          : await supabase.from("medical_visits").insert({ employee_id: employeeId, last_visit_date: event.visitDateIso });
        if (!error && existing) existing.last_visit_date = event.visitDateIso;
      }
      visitsConfirmed.push({ employeeName, visitDate: event.visitDateIso, documentUrl: event.documentUrl });
    }

    // Group by matched employee, keep only each employee's most recent
    // event (by e-mail date) — a later ANNULATION must win over an earlier
    // convocation, and a later re-convocation must win over an earlier one.
    const byEmployee = new Map<string, { email: PrevalyEmail; event: ConvocationEvent }[]>();
    for (const e of events) {
      const employeeId = matchEmployeeByName(e.event.nameLine, employees ?? []);
      if (!employeeId) {
        unmatched.push(e.event.nameLine);
        continue;
      }
      (byEmployee.get(employeeId) ?? byEmployee.set(employeeId, []).get(employeeId)!).push(e);
    }

    for (const [employeeId, list] of byEmployee) {
      list.sort((a, b) => (a.email.date ?? "").localeCompare(b.email.date ?? ""));
      const { email, event } = list[list.length - 1];
      const emp = employeeById.get(employeeId);
      const employeeName = emp ? `${emp.last_name} ${emp.first_name}` : event.nameLine;

      if (event.type === "convocation" && !event.dateIso) {
        unparsedDates.push(`${employeeName} (${email.subject})`);
        continue;
      }

      const existing = visitByEmployeeId.get(employeeId);
      // A hand-entered date is never silently overwritten by a later e-mail
      // — but a cancellation is a fact, not a date guess, so it always wins
      // even over a manual entry (the visit didn't happen either way).
      if (existing && existing.next_visit_source === "manual" && event.type !== "annulation") continue;
      const emailIsNewer = !existing?.next_visit_source_at || (email.date ?? "") > existing.next_visit_source_at;
      if (existing && !emailIsNewer) continue; // already applied this (or a more recent) event

      const payload = {
        next_visit_date: event.type === "annulation" ? null : event.dateIso,
        next_visit_time: event.type === "annulation" ? null : event.time,
        next_visit_source: "email" as const,
        next_visit_source_at: email.date,
        next_visit_source_subject: email.subject,
      };

      const { error } = existing
        ? await supabase.from("medical_visits").update(payload).eq("id", existing.id)
        : await supabase.from("medical_visits").insert({ employee_id: employeeId, ...payload });

      if (!error) {
        applied.push({
          employeeName,
          date: payload.next_visit_date,
          time: payload.next_visit_time,
          cancelled: event.type === "annulation",
        });
      }
    }
  }

  return NextResponse.json({
    emails: emails.map(({ uid, date, from, subject, snippet }) => ({ uid, date, from, subject, snippet })),
    convocations: { applied, unmatched: [...new Set(unmatched)], unparsedDates },
    visitsConfirmed,
  });
}
