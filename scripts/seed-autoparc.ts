/**
 * One-time import for the new Автопарк (fleet) module: seeds vehicle/trailer
 * identity (from the real fleet folder names), contrôle technique due dates
 * + team assignment (from the "Feuille 2" Google Sheet the user maintains),
 * and full maintenance-visit history with the 20-item checklist (from the
 * Lux Motors service log spreadsheet).
 *
 * Insurance, leasing figures, and warranty are deliberately left null here —
 * they're not cleanly available across sources, so per the same rule
 * applied to Paie's SMIC figure, they're filled in later by hand through the
 * Autoparc UI rather than guessed.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/seed-autoparc.ts "/path/to/история обслуживания.xlsx" [--dry-run]
 *
 * Safe to re-run for the identity/CT part (upserts vehicles by plate). NOT
 * safe to re-run for maintenance visits — re-running would insert duplicate
 * visit rows, since there's no natural unique key across (vehicle, date) to
 * upsert on (a vehicle can plausibly be serviced twice on the same date).
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}
if (!filePath) {
  console.error('Usage: npx tsx scripts/seed-autoparc.ts "/path/to/история обслуживания.xlsx" [--dry-run]');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// ── 1. Vehicle/trailer identity — from the real folder names in
// "03 VLADIS /МАШИНЫ/". Reviewable literal data rather than a folder-name
// parser, since there are only ~33 of them and getting a plate wrong would
// silently create a duplicate/wrong vehicle record.
type VehicleSeed = {
  plate: string;
  plateOld?: string;
  brand?: string;
  model?: string;
  vehicleType: "van" | "car" | "trailer" | "heavy_equipment" | "other";
  assignedLabel?: string;
  status?: "active" | "sold" | "stolen" | "archived";
};

const VEHICLES: VehicleSeed[] = [
  // Vans (Renault Trafic team fleet)
  { plate: "GT-869-EC", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К1" },
  { plate: "GH-270-AQ", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К2" },
  { plate: "GT-288-MH", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К3" },
  { plate: "GQ-979-KH", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К4" },
  { plate: "GG-234-WT", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К5" },
  { plate: "WE1G987", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К6" },
  { plate: "LU734TF", plateOld: "WE4S843", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К7" },
  { plate: "HE-596-SL", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К8" },
  { plate: "HF-941-QB", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К9" },
  { plate: "HG-151-QN", brand: "Renault", model: "Trafic", vehicleType: "van", assignedLabel: "К10" },
  { plate: "LU192VJ", plateOld: "WE5F823", brand: "Renault", model: "Trafic Passager", vehicleType: "van" },
  { plate: "LU694TF", plateOld: "WE3J605", brand: "Renault", model: "Master", vehicleType: "van" },
  { plate: "HE-161-BB", brand: "Renault", model: "Kangoo", vehicleType: "van" },
  // Cars
  { plate: "GZ-600-JP", brand: "BMW", vehicleType: "car" },
  { plate: "WL3237U", brand: "Range Rover", vehicleType: "car" },
  { plate: "FH-960-HP", brand: "Skoda", model: "Kodiaq", vehicleType: "car" },
  { plate: "GJ-908-ML", brand: "Skoda", model: "Kamiq", vehicleType: "car" },
  { plate: "GD-749-PZ", brand: "Renault", model: "Talisman", vehicleType: "car" },
  { plate: "HC-262-ND", brand: "Tesla", vehicleType: "car" },
  { plate: "FV-251-KS", brand: "Renault", model: "Megane", vehicleType: "car" },
  { plate: "WOT80316", brand: "Volkswagen", model: "Tiguan", vehicleType: "car" },
  // Trailers
  { plate: "HD-449-AY", vehicleType: "trailer", status: "stolen" },
  { plate: "HK-423-NZ", vehicleType: "trailer" },
  { plate: "HL-117-JL", vehicleType: "trailer" },
  { plate: "GP-911-FA", vehicleType: "trailer", assignedLabel: "К2+" },
  { plate: "GS-331-NS", vehicleType: "trailer", assignedLabel: "К4+" },
  { plate: "HB-761-HN", vehicleType: "trailer", assignedLabel: "К9+" },
  { plate: "HD-427-AY", vehicleType: "trailer", assignedLabel: "К8" },
  { plate: "HE-723-NA", vehicleType: "trailer", assignedLabel: "Офис" },
  { plate: "HE-694-YE", vehicleType: "trailer", assignedLabel: "К5+" },
  { plate: "HF-214-PE", vehicleType: "trailer", assignedLabel: "Офис" },
  { plate: "HF-115-QT", vehicleType: "trailer", assignedLabel: "К7+" },
  { plate: "HG-553-SM", vehicleType: "trailer", assignedLabel: "Офис" },
];

// ── 2. Contrôle technique due dates + fallback team label, fetched live
// from "Feuille 2" of the user's own registration-tracking sheet — avoids
// hand-transcribing ~15 dates.
const FEUILLE2_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/18TZsGuxxfO7mBUxVTeRFm6L-S7BuG-eSvvMJ_aOAQUs/export?format=xlsx";

async function fetchFeuille2(): Promise<Map<string, { ctDueDate: string | null; team: string | null }>> {
  const res = await fetch(FEUILLE2_SHEET_URL);
  if (!res.ok) throw new Error(`Failed to fetch Feuille 2: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets["Feuille 2"];
  if (!sheet) throw new Error('Sheet "Feuille 2" not found in the fetched workbook.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  const map = new Map<string, { ctDueDate: string | null; team: string | null }>();
  for (const row of rows) {
    const plateRaw = row[1];
    if (typeof plateRaw !== "string") continue;
    const plate = plateRaw.replace(/\s+/g, "").trim();
    if (!/^[A-Z0-9-]+$/i.test(plate) || plate.length < 5) continue;
    const teamRaw = row[2];
    const team = typeof teamRaw === "number" ? `К${Math.round(teamRaw)}` : typeof teamRaw === "string" ? teamRaw.trim() : null;
    const ctText = row[8];
    let ctDueDate: string | null = null;
    if (typeof ctText === "string") {
      const m = ctText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) ctDueDate = `${m[3]}-${m[2]}-${m[1]}`;
    }
    map.set(plate, { ctDueDate, team });
  }
  return map;
}

// ── 3. Lux Motors maintenance history — the source file has 3 sheets, each
// with 5 vehicle "column-groups" of 6 columns; groups repeat vertically for
// every dated visit. Which plate sits in which group is fixed (verified
// directly against the file), so it's hardcoded rather than parsed from the
// header text (which mixes old/new plates inconsistently).
const LUX_MOTORS_SHEETS: Record<string, string[]> = {
  "Машины 1-5": ["GT-869-EC", "GH-270-AQ", "GT-288-MH", "GQ-979-KH", "GG-234-WT"],
  "Машины 6-10": ["WE1G987", "LU734TF", "HE-596-SL", "HF-941-QB", "HG-151-QN"],
  "Машины 11-15": ["GD-749-PZ", "FV-251-KS", "LU694TF", "LU192VJ", "HE-161-BB"],
};

const COMPONENT_LABEL_TO_CODE: Record<string, string> = {
  "Замена масла ДВС с фильтром": "oil_engine",
  "Замена масла КПП": "oil_gearbox",
  "Фильтр воздушный": "filter_air",
  "Фильтр салона": "filter_cabin",
  "Фильтр топливный": "filter_fuel",
  "Тормозная жидкость": "brake_fluid",
  Антифриз: "antifreeze",
  "Жидкость гур": "power_steer_fluid",
  "Ремень приводной с роликами": "drive_belt",
  "Механизм ГРМ с помпой": "timing_mechanism",
  "Колодки перед": "pads_front",
  "Колодки зад": "pads_rear",
  "Диски перед с колодками": "discs_front",
  "Диски зад с колодками": "discs_rear",
  "Амортизаторы перед": "shocks_front",
  "Амортизаторы зад": "shocks_rear",
  "Пружины перед": "springs_front",
  "Пружины зад": "springs_rear",
  "Ступичный подшипник": "wheel_bearing",
  Сцепление: "clutch",
};

type ParsedVisit = {
  visitDate: string;
  mileageKm: number | null;
  notes: string | null;
  checklist: Record<string, boolean>;
};

function parseLuxMotorsSheet(rows: unknown[][], plates: string[]): Map<string, ParsedVisit[]> {
  const result = new Map<string, ParsedVisit[]>();
  plates.forEach((p) => result.set(p, []));

  for (let g = 0; g < plates.length; g++) {
    const plate = plates[g];
    const col0 = g * 6;
    const col1 = col0 + 1;
    const col3 = col0 + 3;

    let current: ParsedVisit | null = null;
    let inNotes = false;

    for (const row of rows) {
      const v0 = row[col0];
      // Excel date serials for any plausible service date land well above
      // 1000 (e.g. ~46000 for late 2025) — well clear of the 1-20 item
      // numbers below, so this alone disambiguates a visit-start row.
      // Converted via SSF rather than a JS Date to avoid a UTC/local
      // timezone shift silently rolling the date to the wrong day.
      if (typeof v0 === "number" && v0 > 1000) {
        if (current) result.get(plate)!.push(current);
        const mileageRaw = row[col0 + 2];
        const mileage =
          typeof mileageRaw === "string"
            ? parseInt(mileageRaw.replace(/[^\d]/g, ""), 10) || null
            : typeof mileageRaw === "number"
              ? mileageRaw
              : null;
        const d = XLSX.SSF.parse_date_code(v0);
        const visitDate = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        current = { visitDate, mileageKm: mileage, notes: null, checklist: {} };
        inNotes = false;
        continue;
      }
      // A header row also ends any preceding notes section — some rounds
      // repeat the header/checklist for a vehicle that wasn't actually
      // serviced that round (all items false, no date of its own); without
      // this reset, "inNotes" from the previous round would stay stuck and
      // silently swallow that block's real (if all-false) checklist rows.
      if (v0 === "№") {
        inNotes = false;
        continue;
      }
      if (v0 === "Заметки:") {
        inNotes = true;
        continue;
      }
      if (typeof v0 === "number" && current && !inNotes) {
        const label = String(row[col1] ?? "").trim();
        const code = COMPONENT_LABEL_TO_CODE[label];
        if (code) current.checklist[code] = row[col3] === true;
        continue;
      }
      if (inNotes && typeof v0 === "string" && v0.trim() && current) {
        current.notes = current.notes ? current.notes + "\n" + v0.trim() : v0.trim();
      }
    }
    if (current) result.get(plate)!.push(current);
  }

  // Drop entirely-empty rounds (no mileage, nothing checked, no notes) —
  // the source sheet keeps a blank header+checklist template for a vehicle
  // that wasn't actually serviced that round, which isn't a real visit.
  //
  // Also drop the exact "2025-11-20 / 20000 km, nothing checked" row —
  // confirmed (by diffing the raw sheet) to appear identically, verbatim,
  // on at least 5 unrelated vehicles. That's not a coincidence a real fleet
  // could produce; it's a leftover copy-pasted placeholder from when those
  // rows were created, not a real visit.
  for (const [plate, visits] of result) {
    result.set(
      plate,
      visits.filter((v) => {
        if (v.mileageKm === null && v.notes === null && !Object.values(v.checklist).some(Boolean)) return false;
        if (v.visitDate === "2025-11-20" && v.mileageKm === 20000 && !Object.values(v.checklist).some(Boolean)) {
          console.warn(`  ⚠ ${plate}: dropped a "2025-11-20 / 20000 km" row — matches a known placeholder pattern.`);
          return false;
        }
        return true;
      })
    );
  }

  // Flag (don't drop — still reviewable/deletable in the UI) any visit
  // whose mileage is lower than an earlier one for the same vehicle, since
  // that's the clearest sign of a misread row rather than an actual
  // odometer rollback.
  for (const [plate, visits] of result) {
    const sorted = [...visits].sort((a, b) => a.visitDate.localeCompare(b.visitDate));
    let maxSoFar = -1;
    for (const v of sorted) {
      if (v.mileageKm !== null) {
        if (maxSoFar >= 0 && v.mileageKm < maxSoFar) {
          console.warn(
            `  ⚠ ${plate}: visit ${v.visitDate} has mileage ${v.mileageKm} km, lower than an earlier visit (${maxSoFar} km) — check this row in the source file before trusting it.`
          );
        }
        maxSoFar = Math.max(maxSoFar, v.mileageKm);
      }
    }
  }

  return result;
}

async function main() {
  console.log(dryRun ? "=== DRY RUN — no writes will be made ===" : "=== Seeding Autoparc ===");

  // Vehicles
  console.log(`\nUpserting ${VEHICLES.length} vehicles/trailers…`);
  const plateToId = new Map<string, string>();
  if (!dryRun) {
    for (const v of VEHICLES) {
      const { data, error } = await supabase
        .from("vehicles")
        .upsert(
          {
            plate: v.plate,
            plate_old: v.plateOld ?? null,
            brand: v.brand ?? null,
            model: v.model ?? null,
            vehicle_type: v.vehicleType,
            assigned_label: v.assignedLabel ?? null,
            status: v.status ?? "active",
          },
          { onConflict: "plate" }
        )
        .select("id, plate")
        .single();
      if (error || !data) {
        console.error(`  ✗ ${v.plate}: ${error?.message}`);
        continue;
      }
      plateToId.set(data.plate, data.id);
    }
    console.log(`  ✓ ${plateToId.size}/${VEHICLES.length} upserted`);
  } else {
    VEHICLES.forEach((v) => console.log(`  would upsert: ${v.plate}${v.plateOld ? ` (ex-${v.plateOld})` : ""} — ${v.vehicleType}`));
  }

  // Contrôle technique + team assignment
  console.log("\nFetching Feuille 2 (contrôle technique + team)…");
  const feuille2 = await fetchFeuille2();
  console.log(`  found ${feuille2.size} rows`);
  for (const v of VEHICLES) {
    const info = feuille2.get(v.plate) ?? (v.plateOld ? feuille2.get(v.plateOld) : undefined);
    if (!info) continue;
    const update: Record<string, string | null> = {};
    if (info.ctDueDate) update.ct_due_date = info.ctDueDate;
    if (info.team && !v.assignedLabel) update.assigned_label = info.team;
    if (Object.keys(update).length === 0) continue;
    console.log(`  ${v.plate}: ${JSON.stringify(update)}`);
    if (!dryRun) {
      const id = plateToId.get(v.plate);
      if (!id) continue;
      const { error } = await supabase.from("vehicles").update(update).eq("id", id);
      if (error) console.error(`  ✗ ${v.plate}: ${error.message}`);
    }
  }

  // Maintenance history
  console.log(`\nParsing Lux Motors file: ${filePath}`);
  const fileBuffer = await import("node:fs").then((fs) => fs.readFileSync(filePath));
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  let totalVisits = 0;
  for (const [sheetName, plates] of Object.entries(LUX_MOTORS_SHEETS)) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      console.error(`  ✗ sheet "${sheetName}" not found`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const byPlate = parseLuxMotorsSheet(rows, plates);
    for (const [plate, visits] of byPlate) {
      console.log(`  ${plate}: ${visits.length} visit(s)`);
      totalVisits += visits.length;
      if (dryRun) continue;
      const id = plateToId.get(plate);
      if (!id) {
        console.error(`  ✗ ${plate}: no matching vehicle id — skipped`);
        continue;
      }
      for (const visit of visits) {
        const { data: visitRow, error } = await supabase
          .from("vehicle_maintenance_visits")
          .insert({
            vehicle_id: id,
            visit_date: visit.visitDate,
            mileage_km: visit.mileageKm,
            provider: "Lux Motors",
            notes: visit.notes,
          })
          .select("id")
          .single();
        if (error || !visitRow) {
          console.error(`  ✗ ${plate} @ ${visit.visitDate}: ${error?.message}`);
          continue;
        }
        const itemRows = Object.entries(visit.checklist).map(([component_code, done]) => ({
          visit_id: visitRow.id,
          component_code,
          done,
        }));
        if (itemRows.length > 0) {
          const { error: itemsError } = await supabase.from("vehicle_maintenance_visit_items").insert(itemRows);
          if (itemsError) console.error(`  ✗ ${plate} @ ${visit.visitDate} items: ${itemsError.message}`);
        }
      }
    }
  }
  console.log(`\n${dryRun ? "Would insert" : "Inserted"} ${totalVisits} maintenance visits total.`);
  console.log(
    "\nNote: insurance, leasing, and warranty fields were left empty on purpose — fill them in via the Autoparc UI."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
