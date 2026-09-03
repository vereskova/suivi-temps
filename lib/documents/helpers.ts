const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** "2026-07-14" -> "14 juillet 2026". Returns the placeholder for missing/invalid dates. */
export function formatDateFr(iso: string | null | undefined, fallback = "____________"): string {
  if (!iso) return fallback;
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return fallback;
  return `${d.getUTCDate()} ${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2026-07-14" -> "14/07/2026". */
export function formatDateShort(iso: string | null | undefined, fallback = "__/__/____"): string {
  if (!iso) return fallback;
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return fallback;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function formatEuros(amount: number | null | undefined, fallback = "____________"): string {
  if (amount === null || amount === undefined || isNaN(amount)) return fallback;
  // fr-FR's thousands separator is U+202F (narrow no-break space), which
  // several fonts render as a stray mark in the generated Word doc — plain
  // space renders reliably everywhere and reads exactly the same.
  return (
    amount
      .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .replace(/[  ]/g, " ") + " €"
  );
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().split("T")[0];
}

export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}
