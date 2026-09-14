import * as XLSX from "xlsx";

// Publicly link-shared workbook (Google Sheets export, no auth needed) — one
// sheet per month, each a hand-maintained team × week grid. "TS" and
// "PAS FINI" are unrelated tracking lists (devis/backlog), not the planning
// grid, and are skipped.
const PLANNING_SHEET_ID = "1PcyKlR5UlLwEV88MWKCKqwom2FGrihba";
const PLANNING_EXPORT_URL = `https://docs.google.com/spreadsheets/d/${PLANNING_SHEET_ID}/export?format=xlsx`;
const SKIPPED_SHEETS = new Set(["TS", "PAS FINI"]);

const TAG_VOCAB = new Set([
  "ENGIN", "ELEC", "SI", "PPSPS", "AC", "BENNE", "DEVIS", "CONSUEL+DOE", "ÉTIQUETTES", "ETIQUETTES",
  "SHELTER", "DEMONTAGE PPV", "INSTALATION FILLE SUR FACE", "PPV", "ELEC+SI",
]);

export type PlanningJob = {
  month: string;
  team: string;
  week: string;
  dateFrom: string;
  dateTo: string;
  /** First text fragment found in the block — usually the worker's name. */
  worker: string | null;
  /** Second text fragment — usually the site/chantier name. */
  site: string | null;
  /** Any further text fragments (address, ad-hoc notes she jots directly
   *  into the grid — e.g. a reminder about a colleague's medical visit —
   *  shown as-is rather than guessed into a specific field). */
  notes: string[];
  tags: string[];
  power: string | null;
  coords: string | null;
  code: string | null;
};

function classifyCell(raw: string): { kind: "code" | "coords" | "power" | "tag" | "bool" | "text"; value: string } {
  const v = raw.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (/^\d{1,2}\.\d{1,2}$/.test(v)) return { kind: "code", value: v };
  if (/-?\d{1,3}[.,]\d+\s*,\s*-?\d{1,3}[.,]\d+/.test(v)) return { kind: "coords", value: v };
  if (/^\d[\d\s.,]*\s*kwc?$/i.test(v)) return { kind: "power", value: v };
  if (TAG_VOCAB.has(v.toUpperCase())) return { kind: "tag", value: v };
  if (/^(true|false)$/i.test(v)) return { kind: "bool", value: v };
  return { kind: "text", value: v };
}

function findTeamBands(colA: string[]): { label: string; startRow: number; endRow: number }[] {
  const starts: { label: string; startRow: number }[] = [];
  for (let r = 0; r < colA.length; r++) {
    const v = (colA[r] ?? "").trim();
    if (v && v !== "Tableau 1" && v !== "Equipe") starts.push({ label: v, startRow: r });
  }
  return starts.map((b, i) => ({ ...b, endRow: (starts[i + 1]?.startRow ?? colA.length) - 1 }));
}

function findWeekColumns(weekRow: string[]): { week: string; startCol: number; endCol: number }[] {
  const starts: { week: string; startCol: number }[] = [];
  for (let c = 1; c < weekRow.length; c++) {
    const v = (weekRow[c] ?? "").trim();
    if (v) starts.push({ week: v, startCol: c });
  }
  return starts.map((w, i) => ({ ...w, endCol: (starts[i + 1]?.startCol ?? weekRow.length) - 1 }));
}

/** Parses one month sheet into one job per (team, week) — a team works one
 *  site per week in this planning grid. The sheet is hand-maintained for
 *  visual browsing, not machine parsing: a job spanning several weeks has
 *  its name/site/tags scattered anywhere across that whole span rather than
 *  neatly inside one week's 7 columns, so a week that falls in the middle
 *  of such a multi-week job can come out with mixed-up or partial text.
 *  Kept as an accepted limitation rather than guessed away. */
export function parseMonthSheet(sheet: XLSX.WorkSheet, monthLabel: string): PlanningJob[] {
  const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const weekRow = data[2] ?? [];
  const dateRow = data[3] ?? [];
  const colA = data.map((r) => r[0] ?? "");
  const bands = findTeamBands(colA);
  const weeks = findWeekColumns(weekRow);

  const jobs: PlanningJob[] = [];
  for (const band of bands) {
    for (const wk of weeks) {
      const texts: string[] = [];
      const tags: string[] = [];
      let power: string | null = null;
      let coords: string | null = null;
      let code: string | null = null;
      for (let r = band.startRow; r <= Math.min(band.endRow, band.startRow + 3); r++) {
        for (let c = wk.startCol; c <= wk.endCol; c++) {
          const raw = data[r]?.[c] ?? "";
          if (!raw.trim()) continue;
          const { kind, value } = classifyCell(raw);
          if (kind === "tag") tags.push(value);
          else if (kind === "power") power = value;
          else if (kind === "coords") coords = value;
          else if (kind === "code") code = value;
          else if (kind === "text") texts.push(value);
        }
      }
      if (texts.length === 0 && tags.length === 0 && !power && !coords) continue;
      jobs.push({
        month: monthLabel,
        team: band.label,
        week: wk.week,
        dateFrom: dateRow[wk.startCol] ?? "",
        dateTo: dateRow[wk.endCol] ?? "",
        worker: texts[0] ?? null,
        site: texts[1] ?? null,
        notes: texts.slice(2),
        tags,
        power,
        coords,
        code,
      });
    }
  }
  return jobs;
}

export async function fetchPlanningJobs(): Promise<PlanningJob[]> {
  const res = await fetch(PLANNING_EXPORT_URL);
  if (!res.ok) throw new Error(`Échec du téléchargement du planning (${res.status})`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const jobs: PlanningJob[] = [];
  for (const sheetName of wb.SheetNames) {
    if (SKIPPED_SHEETS.has(sheetName)) continue;
    jobs.push(...parseMonthSheet(wb.Sheets[sheetName], sheetName));
  }
  return jobs;
}
