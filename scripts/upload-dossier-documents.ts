/**
 * One-time bulk import: uploads the real scanned documents from
 * "01 RH/Salarie en cours" (one subfolder per employee, recursively) into
 * the dossier-salarie Storage bucket + employee_documents.
 *
 * Folder -> employee matching: a generic normalized-token match (every word
 * in the folder name must appear among the employee's own first/last name
 * words) covers all but 3 folders where the source data has a spelling
 * variant (ILIN/ILIIN, Tsapko/TSAPKO Serhii/Serghii, VORONINSKIY/VORONINSKII)
 * — those 3 are hardcoded overrides, individually verified against the
 * employees table before writing this script. Any folder that still doesn't
 * resolve to exactly one employee is skipped and reported, never guessed.
 *
 * Categorization is filename/path-keyword based against the real
 * document_categories codes (contrat, rib, assurance_maladie,
 * medical_prevaly, titre_visa, passeport, rupture, carte_btp, carte_vitale,
 * dpae, photo, formation, archive, habilitation, acte_naissance,
 * permis_conduire, autorisation_travail, validation_vls_ts) — best-effort,
 * unrecognized files default to "archive" rather than a guessed sensitive
 * category. contrat/rupture/dpae are "per_period" (need a
 * registre_entry_id) — resolved to that employee's own most recent
 * registre_unique_personnel row when one exists, left unset otherwise.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/upload-dossier-documents.ts "/path/to/01 RH/Salarie en cours" [--dry-run]
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
  console.error('Usage: npx tsx scripts/upload-dossier-documents.ts "/path/to/01 RH/Salarie en cours" [--dry-run]');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);
const BUCKET = "dossier-salarie";

const SKIP_FOLDERS = [".claude"];

// Individually verified against `employees` — see the script comment above.
const FOLDER_OVERRIDES: Record<string, { last: string; first: string }> = {
  "ILIN Evghenii": { last: "ILIIN", first: "Evghenii" },
  "Tsapko Serhii": { last: "TSAPKO", first: "Serghii" },
  VORONINSKIY: { last: "VORONINSKII", first: "Vladimir" },
};

function norm(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

type CategoryRule = { pattern: RegExp; category: string };
const CATEGORY_RULES: CategoryRule[] = [
  { pattern: /titre.{0,3}s[ée]jour|r[ée]c[ée]piss[ée]|visa(?!.{0,3}vls)/i, category: "titre_visa" },
  { pattern: /vls[\s-]?ts/i, category: "validation_vls_ts" },
  { pattern: /passeport|passport/i, category: "passeport" },
  { pattern: /carte\s*vitale/i, category: "carte_vitale" },
  { pattern: /assurance.{0,3}maladie|ameli|cpam|attestation.{0,3}droits/i, category: "assurance_maladie" },
  { pattern: /prevaly|m[ée]decine.{0,3}travail|visite.{0,3}m[ée]dical|aptitude/i, category: "medical_prevaly" },
  { pattern: /\bbtp\b/i, category: "carte_btp" },
  { pattern: /autorisation.{0,3}travail/i, category: "autorisation_travail" },
  { pattern: /acte.{0,3}naissance|birth\s*certificate|свидетельств.{0,3}рожд|svid.{0,3}rogd/i, category: "acte_naissance" },
  { pattern: /permis.{0,3}conduire|driving.{0,3}licen[cs]e|\bправа\b|\bprava\d*\b/i, category: "permis_conduire" },
  { pattern: /habilitation|caces|nacelle/i, category: "habilitation" },
  { pattern: /\brib\b|iban/i, category: "rib" },
  { pattern: /dpae/i, category: "dpae" },
  { pattern: /rupture|d[ée]mission|licenciement|solde.{0,3}tout.{0,3}compte/i, category: "rupture" },
  { pattern: /contrat|cdi|cdd|avenant/i, category: "contrat" },
  { pattern: /formation|attestation.{0,3}stage/i, category: "formation" },
  { pattern: /\bphoto\b/i, category: "photo" },
  // Folder-name fallback — only reached when no filename keyword above
  // matched, for the "3. MEDICAL_SANTE" folder some employees use
  // internally (the "contrat"/"dpae"/etc. rules above already match
  // folder names too, e.g. "2. CONTRAT/", so no separate fallback needed
  // for those).
  { pattern: /medical.?sant[ée]/i, category: "medical_prevaly" },
];
const PER_PERIOD_CATEGORIES = new Set(["contrat", "rupture", "dpae"]);

function categorize(relPath: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(relPath)) return rule.category;
  }
  return "archive";
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

function sanitizeForStorageKey(name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const safeBase = base.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "file";
  const safeExt = ext.replace(/[^A-Za-z0-9.]+/g, "");
  return safeBase + safeExt;
}

function walk(dir: string, relBase = ""): { relPath: string; fullPath: string }[] {
  const out: { relPath: string; fullPath: string }[] = [];
  for (const rawName of fs.readdirSync(dir)) {
    const name = rawName.normalize("NFC");
    if (name === ".DS_Store") continue;
    if (name.endsWith(".numbers") || name.endsWith(".pages") || name.endsWith(".key")) continue;
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

type Emp = { id: string; first_name: string; last_name: string; status: string };

function matchFolder(folder: string, emps: Emp[]): Emp | null {
  if (FOLDER_OVERRIDES[folder]) {
    const { last, first } = FOLDER_OVERRIDES[folder];
    return emps.find((e) => norm(e.last_name) === norm(last) && norm(e.first_name) === norm(first)) ?? null;
  }
  const parts = norm(folder).split(" ").filter(Boolean);
  const matches = emps.filter((e) => {
    const words = new Set([...norm(e.first_name).split(" "), ...norm(e.last_name).split(" ")]);
    return parts.length > 0 && parts.every((p) => words.has(p));
  });
  return matches.length === 1 ? matches[0] : null;
}

async function main() {
  console.log(dryRun ? "=== DRY RUN — no uploads will be made ===" : "=== Uploading Dossier salarié documents ===");

  const { data: emps, error } = await supabase.from("employees").select("id, first_name, last_name, status");
  if (error) throw error;

  const { data: regRows } = await supabase
    .from("registre_unique_personnel")
    .select("id, employee_id, date_entree")
    .order("date_entree", { ascending: false });
  const registreIdByEmployee = new Map<string, string>();
  (regRows ?? []).forEach((r: { id: string; employee_id: string | null }) => {
    if (r.employee_id && !registreIdByEmployee.has(r.employee_id)) registreIdByEmployee.set(r.employee_id, r.id);
  });

  const entries = fs.readdirSync(baseDir);
  let totalUploaded = 0;
  let totalSkippedFolders = 0;

  for (const rawEntry of entries) {
    const entry = rawEntry.normalize("NFC");
    if (entry === ".DS_Store" || SKIP_FOLDERS.includes(entry)) continue;
    const full = path.join(baseDir, rawEntry);
    if (!fs.statSync(full).isDirectory()) continue;

    const emp = matchFolder(entry, emps as Emp[]);
    if (!emp) {
      console.log(`\n✗ "${entry}" — no unambiguous employee match, skipped`);
      totalSkippedFolders++;
      continue;
    }

    const files = walk(full);
    console.log(`\n"${entry}" -> ${emp.last_name} ${emp.first_name} (${files.length} file(s))`);
    const { data: existingDocs } = await supabase
      .from("employee_documents")
      .select("file_name")
      .eq("employee_id", emp.id);
    const alreadyUploaded = new Set((existingDocs ?? []).map((d) => d.file_name));

    for (const f of files) {
      const category = categorize(f.relPath);
      const displayName = f.relPath;
      const registreEntryId = PER_PERIOD_CATEGORIES.has(category)
        ? registreIdByEmployee.get(emp.id) ?? null
        : null;
      if (dryRun) {
        console.log(`  [${category}${registreEntryId ? " · periode" : ""}] ${displayName}`);
        totalUploaded++;
        continue;
      }
      if (alreadyUploaded.has(displayName)) {
        continue; // re-run safety: already uploaded in a previous pass
      }
      const storagePath = `${emp.id}/${category}/${uniqueFileToken()}_${sanitizeForStorageKey(f.relPath)}`;
      const buffer = fs.readFileSync(f.fullPath);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: mimeTypeFor(f.relPath) ?? undefined });
      if (uploadError) {
        console.error(`  ✗ ${displayName}: ${uploadError.message}`);
        continue;
      }
      const { error: insertError } = await supabase.from("employee_documents").insert({
        employee_id: emp.id,
        category_code: category,
        file_name: displayName,
        storage_path: storagePath,
        file_size: buffer.length,
        mime_type: mimeTypeFor(f.relPath),
        registre_entry_id: registreEntryId,
      });
      if (insertError) {
        console.error(`  ✗ ${displayName} (db row): ${insertError.message}`);
        continue;
      }
      console.log(`  ✓ [${category}] ${displayName}`);
      totalUploaded++;
    }
  }

  console.log(`\n${dryRun ? "Would upload" : "Uploaded"} ${totalUploaded} files. ${totalSkippedFolders} folder(s) skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
