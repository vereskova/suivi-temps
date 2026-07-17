/**
 * One-time migration: import the historical hours logged in the old Google
 * Sheet (APP_DATA tab) into `pointage_entries`.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-historical-pointage.ts
 *
 * Requires the service-role key (bypasses RLS). Safe to re-run: upserts on
 * (work_date, employee_id), and reuses an employee it already created by name.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const APP_DATA_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1pqb4yR2tNFxdeZVQBP2BO453w3T_F2_nkwXJJtaXqzg/export?format=csv&gid=854359254";

/**
 * These 28 names cover everyone in the historical sheet. 25 already match
 * `employees` seeded from data/equipes.ts. These 3 don't — they've since left
 * or been swapped out of their team. Their historical team was inferred from
 * which submission batch (same date+start+end+pause, written consecutively
 * by the old Apps Script) they appeared in:
 * - BOTNARI Aleksandr / GUZUN Mihail: always submitted alongside GARBUZ
 *   Nicolai (Equipe 1's chef) -> Equipe 1.
 * - ROPONICA Dionis: always submitted alone, no teammate signal at all in
 *   the data -> left unassigned; their 1 historical row is skipped and
 *   flagged below for RH to place manually via the Employés screen if wanted.
 */
const ORPHAN_TEAM_BY_NAME: Record<string, string | null> = {
  "BOTNARI Aleksandr": "Equipe 1",
  "GUZUN Mihail": "Equipe 1",
  "ROPONICA Dionis": null,
};

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: fullName.trim() };

  const lastNameParts: string[] = [];
  let i = 0;
  while (i < parts.length && parts[i] === parts[i].toUpperCase()) {
    lastNameParts.push(parts[i]);
    i++;
  }
  if (lastNameParts.length === 0) {
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" ") || parts[0],
    };
  }
  return {
    firstName: parts.slice(i).join(" "),
    lastName: lastNameParts.join(" "),
  };
}

function timeToMinutes(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

type SheetRow = Record<string, string>;

// Minimal CSV parser (handles quoted fields) — deliberately not using SheetJS
// here: it auto-detects cell types from CSV text and silently turned some
// "2026-04-11"-looking Date cells into Excel serial numbers, corrupting them.
// Plain string parsing avoids that entirely.
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function parseCsv(text: string): SheetRow[] {
  const lines = text.split(/\r\n|\n/).filter((l) => l.length > 0);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: SheetRow = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

async function main() {
  console.log("Fetching historical data from the Google Sheet...");
  const res = await fetch(APP_DATA_CSV_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet CSV: HTTP ${res.status}`);
  }
  const csvText = await res.text();
  const rows = parseCsv(csvText);
  console.log(`Read ${rows.length} rows.`);

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id, first_name, last_name, team_id")
    .eq("category", "chantier");
  if (employeesError) throw employeesError;

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name");
  if (teamsError) throw teamsError;

  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));
  const employeeByName = new Map(
    employees.map((e) => [
      `${e.last_name} ${e.first_name}`.trim().toLowerCase(),
      e,
    ])
  );

  const createdEmployees: string[] = [];
  const skippedRows: string[] = [];
  const upserts: Record<string, unknown>[] = [];

  for (const row of rows) {
    const name = (row["Employé"] || "").trim();
    if (!name) continue;

    const key = name.toLowerCase();
    let employee = employeeByName.get(key);

    if (!employee) {
      const { firstName, lastName } = parseName(name);
      const orphanTeamName = ORPHAN_TEAM_BY_NAME[name];
      const teamId = orphanTeamName ? teamIdByName.get(orphanTeamName) ?? null : null;

      const { data: inserted, error: insertError } = await supabase
        .from("employees")
        .insert({
          first_name: firstName,
          last_name: lastName,
          category: "chantier",
          team_id: teamId,
          status: "terminated",
        })
        .select("id, first_name, last_name, team_id")
        .single();
      if (insertError) throw insertError;

      employee = inserted;
      employeeByName.set(key, employee);
      createdEmployees.push(`${name} -> ${orphanTeamName ?? "sans équipe"}`);
    }

    if (!employee.team_id) {
      skippedRows.push(`${row["Date"]} ${name} (aucune équipe connue)`);
      continue;
    }

    const isAbsent = (row["Absent"] || "").trim().toLowerCase() === "oui";
    const overtimeRaw = row["H. Supp"] ?? row["H. Supp "] ?? "";

    upserts.push({
      work_date: row["Date"],
      team_id: employee.team_id,
      employee_id: employee.id,
      start_time: isAbsent ? null : row["Début"] || null,
      end_time: isAbsent ? null : row["Fin"] || null,
      pause_minutes: isAbsent ? null : timeToMinutes(row["Pause"] || ""),
      overtime_minutes: isAbsent ? null : timeToMinutes(overtimeRaw),
      is_absent: isAbsent,
    });
  }

  // The sheet has a handful of duplicate (date, employee) rows (re-submissions/
  // corrections). Postgres' ON CONFLICT can't touch the same row twice in one
  // statement, so dedupe here, keeping the later row (assumed to be the fix).
  const dedupedByKey = new Map<string, Record<string, unknown>>();
  for (const entry of upserts) {
    dedupedByKey.set(`${entry.work_date}|${entry.employee_id}`, entry);
  }
  const deduped = Array.from(dedupedByKey.values());
  if (deduped.length < upserts.length) {
    console.log(
      `Deduplicated ${upserts.length - deduped.length} duplicate (date, employé) row(s).`
    );
  }

  console.log(`\nImporting ${deduped.length} pointage entries...`);
  const chunkSize = 200;
  for (let i = 0; i < deduped.length; i += chunkSize) {
    const chunk = deduped.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("pointage_entries")
      .upsert(chunk, { onConflict: "work_date,employee_id" });
    if (error) throw error;
    console.log(`  ${Math.min(i + chunkSize, deduped.length)}/${deduped.length}`);
  }

  console.log(`\nDone. ${deduped.length} entries imported.`);

  if (createdEmployees.length > 0) {
    console.log(
      `\n${createdEmployees.length} employee(s) from the historical data were not in the current roster — created as 'terminated':`
    );
    createdEmployees.forEach((c) => console.log(`  - ${c}`));
  }

  if (skippedRows.length > 0) {
    console.log(
      `\n${skippedRows.length} row(s) skipped (no team could be determined) — review in the Employés screen:`
    );
    skippedRows.forEach((s) => console.log(`  - ${s}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
