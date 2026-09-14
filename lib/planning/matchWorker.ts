export type PlanningEmployeeCandidate = {
  id: string;
  first_name: string;
  last_name: string;
};

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Builds a reusable matcher over one employee roster snapshot — used for
 *  every "worker" cell text pulled from the planning sheet. Most names in
 *  that sheet are subcontractors/temp crew with no record in our own
 *  employees table at all (expected, not a bug); for the ones who ARE our
 *  employees, the cell text is often more than just their name (e.g.
 *  "BORETS Yevhen Visite médical 13:00"), so matching is done by
 *  whole-word containment rather than exact equality. A first name shared
 *  by more than one active employee (e.g. two "Nicolai") is left unmatched
 *  rather than guessed. */
export function buildWorkerMatcher<T extends PlanningEmployeeCandidate>(employees: T[]) {
  const byFirstName = new Map<string, T[]>();
  for (const e of employees) {
    const fn = normalizeName(e.first_name);
    (byFirstName.get(fn) ?? byFirstName.set(fn, []).get(fn)!).push(e);
  }

  return function matchWorker(worker: string | null): T | null {
    if (!worker) return null;
    const words = new Set(normalizeName(worker).split(/[^a-z]+/).filter(Boolean));
    for (const [firstName, candidates] of byFirstName) {
      if (!words.has(firstName)) continue;
      const withLastName = candidates.find((c) => words.has(normalizeName(c.last_name)));
      if (withLastName) return withLastName;
      if (candidates.length === 1) return candidates[0];
    }
    return null;
  };
}
