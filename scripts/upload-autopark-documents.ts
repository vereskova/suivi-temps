/**
 * One-time bulk import: uploads the real scanned documents from
 * "03 VLADIS /МАШИНЫ/" (one subfolder per vehicle/trailer, recursively) into
 * the autopark-documents Storage bucket + vehicle_documents, matched to the
 * exact vehicle each folder was already identified as in
 * scripts/seed-autoparc.ts.
 *
 * Categorization is filename/path-keyword based (folder path first, then
 * filename) — best-effort, not exact. Anything unrecognized lands in
 * "autre" rather than being guessed into a specific category; miscategorized
 * files are easy to spot and re-upload via the Autoparc UI.
 *
 * Deliberately excludes folders that are company-wide rather than
 * per-vehicle (insurance broker archive, COC scans with no vehicle-
 * identifying filename, equipment inventory, purchase overviews) — those
 * need a human to decide where they belong, not a script.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/upload-autopark-documents.ts "/path/to/03 VLADIS /МАШИНЫ" [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseDir = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}
if (!baseDir) {
  console.error('Usage: npx tsx scripts/upload-autopark-documents.ts "/path/to/03 VLADIS /МАШИНЫ" [--dry-run]');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);
const BUCKET = "autopark-documents";

// Folder name -> plate, exactly matching scripts/seed-autoparc.ts's identity
// list. Folders not listed here are skipped (see the printed summary).
const FOLDER_TO_PLATE: Record<string, string> = {
  "BMW GZ-600-JP": "GZ-600-JP",
  "(украли)_Прицеп-HD+449-AY-": "HD-449-AY",
  "MASTER WE 3J605(LU694TF)": "LU694TF",
  "MEGANE FV-251-KS": "FV-251-KS",
  "RENAULT KANGOO HE-161-BB": "HE-161-BB",
  "RR WL 3237U": "WL3237U",
  "Skoda Kodiaq_FH-960-HP": "FH-960-HP",
  "Skoda kamiq_GJ-908-ML": "GJ-908-ML",
  "TALISMAN GD-749-PZ": "GD-749-PZ",
  "TESLA HC-262-ND": "HC-262-ND",
  "TRAFIC GG-234-WT (К5)": "GG-234-WT",
  "TRAFIC GH-270-AQ (К2)": "GH-270-AQ",
  "TRAFIC GQ-979-KH (К4)": "GQ-979-KH",
  "TRAFIC GT-288-MH (К3)": "GT-288-MH",
  "TRAFIC GT-869-EC (К1)": "GT-869-EC",
  "TRAFIC HE-596-SL (К8)": "HE-596-SL",
  "TRAFIC HF-941-QB (К9)": "HF-941-QB",
  "TRAFIC HG-151-QN (К10)": "HG-151-QN",
  "VOLKSWAGEN Tiguan WOT 80316": "WOT80316",
  "WE 1G987 (К6)": "WE1G987",
  "WE 4S843(LU734TF)(К7)": "LU734TF",
  "WE 5F823 (лизинг до 24:01:25)": "LU192VJ",
  "Прицеп HK-423-NZ": "HK-423-NZ",
  "Прицеп HL-117-JL": "HL-117-JL",
  "Прицеп:1-GP-911-FA - (K-2+)": "GP-911-FA",
  "Прицеп:2-GS-331-NS - (К4+)": "GS-331-NS",
  "Прицеп:4-HD+427-AY-(К8.)": "HD-427-AY",
  "Прицеп:5-HE-723-NA-(офис)": "HE-723-NA",
  "Прицеп:6-HE-694-YE - (К5+)новый": "HE-694-YE",
  "Прицеп:7-HF-214-PE) - (офис)": "HF-214-PE",
  "Прицеп:8 HF-115-QT (К7+)": "HF-115-QT",
  "Прицеп:9-HG-553-SM-(Oфис)": "HG-553-SM",
  "manitou": "MANITOU-MT1840HA",
};
// Trailing NBSP in the real folder name — added via a normalized lookup below.
FOLDER_TO_PLATE["Прицеп:3-HB-761-HN-(К9+) "] = "HB-761-HN";

const EXCLUDED_FOLDERS = [
  "!!Assurances Bernard Gaviano", // company-wide insurance broker archive, not per-vehicle
  "COC", // filenames don't identify which vehicle each scan belongs to
  "опись материалов", // equipment inventory, unrelated to a specific vehicle
  "Покупка Vladis польских машин", // general purchase overview
  "louer des voiturs pologne", // general rental note
];

type CategoryRule = { pattern: RegExp; category: string };
// Checked in order — folder-path keywords first (more reliable context),
// then filename keywords. First match wins; no match -> "autre".
const CATEGORY_RULES: CategoryRule[] = [
  { pattern: /\bcoc\b/i, category: "coc" },
  { pattern: /immatriculation|démarche|accuse-enregistrement/i, category: "immatriculation_fr" },
  { pattern: /quitus/i, category: "certificat_achat" },
  { pattern: /sinistre|constat|accident/i, category: "sinistre" },
  { pattern: /договор|leasing|лизинг|выкуп|cession|wykup|umow[ay] leasing/i, category: "leasing_financement" },
  { pattern: /страховк|assurance|polisa|ubezpiecze|gaviano|quittance/i, category: "assurance" },
  { pattern: /тех\s*паспорт|carte grise|тп[_. ]|^тп\b/i, category: "carte_grise" },
  { pattern: /facture|diagnost|ремонт|révision|revision|entretien/i, category: "entretien_facture" },
];

function categorize(relPath: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(relPath)) return rule.category;
  }
  return "autre";
}

function mimeTypeFor(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  return (
    {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".heic": "image/heic",
    }[ext] ?? null
  );
}

function walk(dir: string, relBase = ""): { relPath: string; fullPath: string }[] {
  const out: { relPath: string; fullPath: string }[] = [];
  for (const rawName of fs.readdirSync(dir)) {
    const name = rawName.normalize("NFC");
    if (name === ".DS_Store") continue;
    if (name.endsWith(".numbers") || name.endsWith(".pages") || name.endsWith(".key")) continue; // compound bundle, not a scan
    const full = path.join(dir, rawName);
    const rel = relBase ? `${relBase}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, rel));
    } else {
      out.push({ relPath: rel, fullPath: full });
    }
  }
  return out;
}

function uniqueFileToken() {
  return Math.random().toString(36).slice(2, 10);
}

// Supabase Storage rejects object keys containing Cyrillic, accented Latin,
// or symbols like ° and — ("Invalid key") — only the storage PATH needs
// this; the human-readable file_name stored in the DB keeps the real name.
function sanitizeForStorageKey(name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const safeBase = base.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "file";
  const safeExt = ext.replace(/[^A-Za-z0-9.]+/g, "");
  return safeBase + safeExt;
}

async function main() {
  console.log(dryRun ? "=== DRY RUN — no uploads will be made ===" : "=== Uploading Autopark documents ===");

  const entries = fs.readdirSync(baseDir);
  const { data: vehicles, error } = await supabase.from("vehicles").select("id, plate");
  if (error) throw error;
  const plateToId = new Map((vehicles ?? []).map((v) => [v.plate, v.id]));

  let totalUploaded = 0;
  let totalSkippedFolders = 0;

  for (const rawEntry of entries) {
    // macOS/iCloud stores filenames NFD-normalized (e.g. "й" as "и" + a
    // combining breve) — normalize to NFC so lookups against these
    // hardcoded (NFC) map keys actually match.
    const entry = rawEntry.normalize("NFC");
    if (entry === ".DS_Store") continue;
    const full = path.join(baseDir, rawEntry);
    if (!fs.statSync(full).isDirectory()) continue; // loose top-level files: skip (general/company docs, already-parsed spreadsheets)

    if (EXCLUDED_FOLDERS.includes(entry)) {
      console.log(`\n⏭  "${entry}" — excluded (not per-vehicle), skipped`);
      totalSkippedFolders++;
      continue;
    }
    const plate = FOLDER_TO_PLATE[entry];
    if (!plate) {
      console.log(`\n⚠ "${entry}" — no known plate mapping, skipped (add it to FOLDER_TO_PLATE if it should be included)`);
      totalSkippedFolders++;
      continue;
    }
    const vehicleId = plateToId.get(plate);
    if (!vehicleId) {
      console.log(`\n✗ "${entry}" -> ${plate} — no matching vehicle row in the DB, skipped`);
      continue;
    }

    const files = walk(full);
    console.log(`\n"${entry}" -> ${plate} (${files.length} file(s))`);
    const { data: existingDocs } = await supabase
      .from("vehicle_documents")
      .select("file_name")
      .eq("vehicle_id", vehicleId);
    const alreadyUploaded = new Set((existingDocs ?? []).map((d) => d.file_name));

    for (const f of files) {
      const category = categorize(f.relPath);
      const displayName = f.relPath;
      if (dryRun) {
        console.log(`  [${category}] ${displayName}`);
        totalUploaded++;
        continue;
      }
      if (alreadyUploaded.has(displayName)) {
        continue; // re-run safety: already uploaded in a previous pass
      }
      const storagePath = `${vehicleId}/${category}/${uniqueFileToken()}_${sanitizeForStorageKey(f.relPath)}`;
      const buffer = fs.readFileSync(f.fullPath);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: mimeTypeFor(f.relPath) ?? undefined });
      if (uploadError) {
        console.error(`  ✗ ${displayName}: ${uploadError.message}`);
        continue;
      }
      const { error: insertError } = await supabase.from("vehicle_documents").insert({
        vehicle_id: vehicleId,
        category_code: category,
        file_name: displayName,
        storage_path: storagePath,
        file_size: buffer.length,
        mime_type: mimeTypeFor(f.relPath),
      });
      if (insertError) {
        console.error(`  ✗ ${displayName} (db row): ${insertError.message}`);
        continue;
      }
      console.log(`  ✓ [${category}] ${displayName}`);
      totalUploaded++;
    }
  }

  console.log(`\n${dryRun ? "Would upload" : "Uploaded"} ${totalUploaded} files. ${totalSkippedFolders} folder(s) skipped (see above).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
