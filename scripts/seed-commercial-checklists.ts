/**
 * One-time import: load the per-client service checklist templates from
 * Checklists_Modeles_Clients_VLADIS.xlsx (12 sheets, one per client — a
 * Trello "modèle" card ported to Excel: N°/Tâche-Catégorie/Statut, with
 * category header rows) into commercial_clients + commercial_checklist_template_items.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-commercial-checklists.ts /path/to/Checklists_Modeles_Clients_VLADIS.xlsx
 *
 * Safe to re-run: upserts the client by name, then replaces (delete+insert)
 * that client's template items entirely — the "Statut" column in the source
 * file is a Trello placeholder ("□ à faire") on every single row across all
 * sheets, so it carries no real data and is ignored on import.
 */
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const filePath = process.argv[2];

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}
if (!filePath) {
  console.error("Usage: npx tsx scripts/seed-commercial-checklists.ts /path/to/Checklists_Modeles_Clients_VLADIS.xlsx");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// Source sheets spell a few categories inconsistently (Trello -> Excel
// export drift). Normalize every variant seen to one of the 7 canonical
// codes seeded by migration 0026; anything unrecognized throws rather than
// silently dropping rows.
const CATEGORY_MAP: Record<string, string> = {
  "devis": "DEVIS",
  "commande mater": "COMMANDE_MATERIEL",
  "livraison": "LIVRAISON",
  "planing": "PLANNING",
  "planning": "PLANNING",
  "étiqueté": "ETIQUETAGE",
  "etiquete": "ETIQUETAGE",
  "étiquetage": "ETIQUETAGE",
  "etiquetage": "ETIQUETAGE",
  "ts": "TS",
  "récupération": "RECUPERATION",
  "recuperation": "RECUPERATION",
  "récuperation": "RECUPERATION",
  "recuperation ": "RECUPERATION",
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveCategory(raw: string, sheetName: string): string {
  const key = normalize(raw);
  const code = CATEGORY_MAP[key];
  if (!code) {
    throw new Error(`Unrecognized category "${raw}" (sheet "${sheetName}") — add it to CATEGORY_MAP.`);
  }
  return code;
}

type TemplateRow = { category_code: string; position: number; label: string; label_normalized: string };

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string): TemplateRow[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const items: TemplateRow[] = [];
  let currentCategory: string | null = null;
  let position = 0;

  // Rows before the "N°" header are title/source-note lines — skip them.
  let started = false;
  for (const row of rows) {
    const [a, b] = row as [unknown, unknown, unknown];
    if (!started) {
      if (String(a ?? "").trim() === "N°") started = true;
      continue;
    }
    const aStr = String(a ?? "").trim();
    const bStr = String(b ?? "").trim();
    if (!aStr && !bStr) continue;

    const isCategoryHeader = aStr !== "" && bStr === "" && Number.isNaN(Number(aStr));
    if (isCategoryHeader) {
      currentCategory = resolveCategory(aStr, sheetName);
      continue;
    }

    if (!currentCategory) {
      throw new Error(`Task row before any category header (sheet "${sheetName}"): ${aStr} / ${bStr}`);
    }
    position += 1;
    items.push({
      category_code: currentCategory,
      position,
      label: bStr,
      label_normalized: normalize(bStr),
    });
  }
  return items;
}

async function main() {
  const workbook = XLSX.readFile(filePath);

  for (const sheetName of workbook.SheetNames) {
    const items = parseSheet(workbook.Sheets[sheetName], sheetName);
    if (items.length === 0) {
      console.warn(`⚠ ${sheetName}: no task rows found, skipping.`);
      continue;
    }

    const { data: client, error: clientError } = await supabase
      .from("commercial_clients")
      .upsert(
        { name: sheetName, name_normalized: normalize(sheetName) },
        { onConflict: "name" }
      )
      .select("id")
      .single();
    if (clientError) throw clientError;

    const { error: deleteError } = await supabase
      .from("commercial_checklist_template_items")
      .delete()
      .eq("client_id", client.id);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase
      .from("commercial_checklist_template_items")
      .insert(items.map((item) => ({ ...item, client_id: client.id })));
    if (insertError) throw insertError;

    console.log(`✓ ${sheetName}: ${items.length} tâches`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
