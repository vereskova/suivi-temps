export type EmployeeMedicalStatus = "jamais_visite" | "a_renouveler" | "visite_prevue" | "a_jour" | "exempte";

type VisitLike = {
  last_visit_date: string | null;
  next_visit_date: string | null;
};

/** Same calendar anniversary N years earlier/later — not a fixed day-count,
 *  which drifts by a day whenever a Feb 29 falls inside the span. */
function addYearsIso(iso: string, years: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().split("T")[0];
}

/** Same rule as the Médical page: a visit is due for renewal once more than
 *  2 years have passed since the last one. */
export function needsNewAppointment(visit: VisitLike, todayIso: string): boolean {
  if (!visit.last_visit_date) return false;
  return visit.last_visit_date <= addYearsIso(todayIso, -2);
}

export function computeMedicalStatus(visit: VisitLike | null, todayIso: string): EmployeeMedicalStatus {
  // The 2-year legal deadline always wins over a stored next_visit_date —
  // Prevaly's "estimated next visit" can land years out (a longer interval
  // for a lower-risk category), but if the last real visit is already more
  // than 2 years old, that estimate doesn't excuse it.
  if (visit && needsNewAppointment(visit, todayIso)) return "a_renouveler";
  // A next_visit_date already covered by a confirmed last_visit_date (the
  // visit happened — e.g. a Prevaly "aptitude" confirmation e-mail) is
  // stale and must not still read as "scheduled".
  const alreadyDone = !!visit?.last_visit_date && !!visit?.next_visit_date && visit.last_visit_date >= visit.next_visit_date;
  if (visit?.next_visit_date && visit.next_visit_date >= todayIso && !alreadyDone) return "visite_prevue";
  if (!visit?.last_visit_date) return "jamais_visite";
  return "a_jour";
}
