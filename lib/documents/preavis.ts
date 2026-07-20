/**
 * Préavis (notice period) lookup — Convention Collective Nationale de la
 * Métallurgie, groupes d'emploi A–I, per the reference table gathered from
 * the "droit du travail" skill. This is a compact summary of the convention,
 * not a substitute for it — double-check against the actual convention text
 * (or a labor lawyer) before relying on this for a real dismissal, especially
 * for groups F–I where notice also depends on the employee's age.
 *
 * `classification` is expected to be a single letter A–I (matches the
 * "groupe d'emploi" shown top-left on the bulletin de paie). Unknown/missing
 * classification falls back to a conservative default and flags it in the
 * returned `note`.
 */

export type PreavisType = "demission" | "licenciement";

export type PreavisResult = {
  label: string; // e.g. "2 mois"
  months: number | null; // approximate, for date math (null if expressed in weeks only)
  weeks: number | null;
  note?: string;
};

function weeks(n: number, note?: string): PreavisResult {
  return { label: `${n} semaine${n > 1 ? "s" : ""}`, months: null, weeks: n, note };
}

function months(n: number, note?: string): PreavisResult {
  return { label: `${n} mois`, months: n, weeks: null, note };
}

export function computePreavis(
  classification: string | null,
  ancienneteYears: number,
  type: PreavisType,
  ageYears: number | null
): PreavisResult {
  const c = (classification || "").trim().toUpperCase();

  if (c === "A" || c === "B") {
    if (type === "demission") return weeks(2);
    return ancienneteYears >= 2 ? months(2) : months(1);
  }

  if (c === "C") {
    if (type === "demission") return months(1);
    return ancienneteYears >= 2 ? months(2) : months(1);
  }

  if (c === "D") {
    if (type === "demission") return months(2);
    return ancienneteYears >= 2 ? months(2) : months(1);
  }

  if (c === "E") {
    if (type === "demission") return months(2);
    if (ancienneteYears >= 3) return months(3);
    return ancienneteYears >= 2 ? months(2) : months(1);
  }

  if (["F", "G", "H", "I"].includes(c)) {
    if (type === "demission") return months(3);
    if (ancienneteYears < 2) return months(1);
    if (ancienneteYears < 3) return months(2);
    // >= 3 years: licenciement notice depends on age.
    if (ageYears === null) {
      return months(3, "Âge inconnu — 3 mois si < 50 ans, 4 si 50–55, 6 si ≥ 55 (à confirmer).");
    }
    if (ageYears >= 55) return months(6);
    if (ageYears >= 50) return ancienneteYears >= 5 ? months(6) : months(4);
    return months(3);
  }

  // Unknown classification: fall back to the shortest legal minimum and flag it clearly.
  return {
    label: type === "demission" ? "1 mois (par défaut)" : "1 mois (par défaut)",
    months: 1,
    weeks: null,
    note: "Classification (groupe d'emploi) manquante — durée par défaut, à vérifier avant envoi.",
  };
}
