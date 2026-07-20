import { Sex } from "./types";

/** "Madame" / "Monsieur" / "Madame, Monsieur" when the employee's sex isn't on file. */
export function civility(sex: Sex): string {
  if (sex === "M") return "Monsieur";
  if (sex === "F") return "Madame";
  return "Madame, Monsieur";
}

/** "Le Salarié" / "La Salariée" / dual fallback — for use at the start of a sentence. */
export function salarieLabel(sex: Sex): string {
  if (sex === "M") return "Le Salarié";
  if (sex === "F") return "La Salariée";
  return "La Salariée / Le Salarié";
}

/** Same as salarieLabel(), lowercased — for mid-sentence use. */
export function salarieLabelLower(sex: Sex): string {
  if (sex === "M") return "le salarié";
  if (sex === "F") return "la salariée";
  return "le/la salarié(e)";
}

/** "du salarié" / "de la salariée" — contracts "de le" to "du", unlike salarieLabelLower(). */
export function salarieDu(sex: Sex): string {
  if (sex === "M") return "du salarié";
  if (sex === "F") return "de la salariée";
  return "du/de la salarié(e)";
}

export function pronoun(sex: Sex): string {
  if (sex === "M") return "il";
  if (sex === "F") return "elle";
  return "il/elle";
}

/** Same as pronoun(), capitalized — for sentence-initial use. */
export function pronounCap(sex: Sex): string {
  if (sex === "M") return "Il";
  if (sex === "F") return "Elle";
  return "Il/Elle";
}

/**
 * Past-participle / adjective agreement: agr(sex, "engagé") -> "engagé" (M), "engagée" (F),
 * "engagé(e)" (unknown) — falls back to the standard neutral written form used throughout
 * French templates when the employee's sex isn't on file.
 */
export function agr(sex: Sex, masculine: string, feminineSuffix = "e"): string {
  if (sex === "M") return masculine;
  if (sex === "F") return masculine + feminineSuffix;
  return `${masculine}(${feminineSuffix})`;
}
