/**
 * Second-generation import of the per-client checklist templates, replacing
 * the flat 7-category model (0026 + seed-commercial-checklists.ts) with:
 *   - a short, flat "core" list per client (one category: DEVIS or PLANNING)
 *   - some clients now have TWO named template variants (same company, two
 *     job types — e.g. "ADVANCED EnerGies" has "Bâtiment" and "Ombrières")
 *   - a separate global "Autres" catalogue (rarely-requested tasks, picked
 *     per-dossier rather than defaulted into every template)
 *
 * Source: Checklists_Modeles_Clients_VLADIS (1).numbers, 14 sheets. Apple
 * Numbers isn't readable by the `xlsx` package already used elsewhere in
 * this repo, so — unlike the original seed script — this one doesn't take a
 * file path argument. The sheet contents were extracted once (via Python's
 * numbers_parser) and are embedded below as literals; re-running this
 * script just re-applies that same fixed dataset. Labels are imported
 * verbatim from the source (including its inconsistent "Firnis"/"Furnis"/
 * "Fournis" spellings) — not corrected, since this is domain jargon the
 * commercial team understands better than an import script should guess
 * at. One exact duplicate row ("Fournis consuel" listed twice under
 * MATÉRIAUX in the source) is silently dropped; a second, non-duplicate
 * repeat ("Tirage AC" appearing twice under ÉLECTRICITÉ at different points
 * in the sequence) is kept as-is.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-commercial-checklists-v2.ts
 *
 * Safe to re-run:
 *   - Clients are upserted by name — a client present in the DB but absent
 *     from this dataset (e.g. "Easing", not in this revision) is left
 *     untouched, never deleted.
 *   - Each (client, variant) template is upserted, then its items are fully
 *     replaced (delete+insert), same as the original script.
 *   - The Autres catalogue is fully replaced (delete+insert) — it's a
 *     single global list, not per-client.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ── Per-client template data (client/variant/category/items), extracted
// verbatim from the source spreadsheet's per-client sheets. ──────────────
const TEMPLATES: { client: string; variant: string; categoryCode: string; items: string[] }[] = [
  {
    client: "Volta",
    variant: "Standard",
    categoryCode: "DEVIS",
    items: [
      "Pose & dépose sécurité colective",
      "Pose /depose fille sur face",
      "Dépose Bac acier",
      "Pose Bac acier",
      "Main-d'œuvre",
      "Tirage AC",
      "Firnis SI",
      "Furnis ELEC",
      "Furnis AC",
      "Firnis SHELTER",
      "Fournis BAC Acier",
      "Fournis ben",
      "Fournis consuel",
      "Fournis doe",
      "Fournis ENGIN",
      "Fournis Petit matel",
    ],
  },
  {
    client: "ADVANCED EnerGies",
    variant: "Bâtiment",
    categoryCode: "DEVIS",
    items: [
      "Pose & dépose sécurité colective",
      "Pose /depose fille sur face",
      "Dépose Bac acier",
      "Pose Bac acier",
      "Main-d'œuvre",
      "Tirage AC",
      "Fournis ENGIN",
      "Fournis BAC Acier",
    ],
  },
  {
    client: "ADVANCED EnerGies",
    variant: "Ombrières",
    categoryCode: "DEVIS",
    items: ["Pose SI", "Main-d'œuvre", "Pose PPV", "Tirage AC", "Fournis ENGIN"],
  },
  {
    client: "Feedgy",
    variant: "Standard",
    categoryCode: "DEVIS",
    items: [
      "Pose & dépose sécurité colective",
      "Démonter panneau",
      "Pose /depose fille sur face",
      "Dépose Bac acier",
      "Pose Bac acier",
      "Main-d'œuvre",
      "Tirage AC",
      "Mise en service",
      "Firnis SI",
      "Furnis ELEC",
      "Furnis AC",
      "Firnis SHELTER",
      "Fournis BAC Acier",
      "Fournis ben",
      "Fournis consuel",
      "Fournis doe",
      "Fournis consuel",
      "Fournis ENGIN",
      "Fournis rives et faitages",
    ],
  },
  {
    client: "Triangle Energie",
    variant: "Standard",
    categoryCode: "PLANNING",
    items: ["Pose & dépose sécurité colective", "Main-d'œuvre", "Tirage AC"],
  },
  {
    client: "Tenergie",
    variant: "Standard",
    categoryCode: "DEVIS",
    items: [
      "Pose & dépose sécurité colective",
      "Main-d'œuvre",
      "Tirage AC",
      "Firnis SI",
      "Furnis ELEC",
      "Furnis AC",
      "Fournis ENGIN",
      "Fournis Petit matel",
    ],
  },
  {
    client: "HML construction",
    variant: "Standard",
    categoryCode: "DEVIS",
    items: [
      "Pose & dépose sécurité colective",
      "Main-d'œuvre",
      "Tirage AC",
      "Fournis Consuel (Attestation de Conformité Bleue)",
      "Fournis ENGIN",
    ],
  },
  {
    client: "CME",
    variant: "Standard",
    categoryCode: "DEVIS",
    items: ["Pose & dépose sécurité colective", "Main-d'œuvre", "Tirage AC"],
  },
  {
    client: "DEVELOPP`SUN",
    variant: "Ombrières",
    categoryCode: "PLANNING",
    items: ["Pose SI", "Main-d'œuvre", "Pose PPV", "Tirage AC"],
  },
  {
    client: "Cegelec",
    variant: "Standard",
    categoryCode: "DEVIS",
    items: ["Pose & dépose sécurité colective", "Main-d'œuvre", "Tirage AC", "Fournis Petit matel", "Fournis ENGIN"],
  },
  {
    client: "Triangle Horizon",
    variant: "Standard",
    categoryCode: "PLANNING",
    items: ["Pose & dépose sécurité colective", "Main-d'œuvre", "Tirage AC"],
  },
  {
    client: "Mateos",
    variant: "Ombrières",
    categoryCode: "DEVIS",
    items: ["Pose SI", "Main-d'œuvre", "Pose PPV", "Tirage AC", "Fournis ENGIN"],
  },
  {
    client: "Mateos",
    variant: "Bâtiment",
    categoryCode: "DEVIS",
    items: ["Pose & dépose sécurité colective", "Main-d'œuvre", "Tirage AC", "Fournis ENGIN"],
  },
];

// ── Global "Autres" catalogue, extracted from the dedicated "Autre" sheet ──
const AUTRE_ITEMS: { categoryCode: string; items: string[] }[] = [
  { categoryCode: "SECURITE", items: ["Pose /depose fille sur face", "Pose & dépose sécurité colective"] },
  {
    categoryCode: "CHARPENTE",
    items: ["Dépose Bac acier", "Pose Bac acier", "Dépose fibrociment sans amiante", "Dépose OSB", "Démonter PPV", "Pose PPV"],
  },
  {
    categoryCode: "ELECTRICITE",
    items: [
      "Câblage DC",
      "Pose SI",
      "Pose et Câblage éclairage Led",
      "Tirage AC",
      "Modification de branchement de panneaux",
      "Pose et raccordement des onduleurs",
      "Tirage et raccordement des câbles AC",
      "Mise à la terre",
      "Tirage AC",
      "Mise en service",
      "Supplémentaire 2-eme locale a cabler",
    ],
  },
  {
    categoryCode: "MATERIAUX",
    items: [
      "Firnis SI",
      "Furnis ELEC",
      "Furnis AC",
      "Firnis SHELTER",
      "Fournis BAC Acier",
      "Fournis ben",
      "Fournis consuel",
      "Fournis doe",
      "Fournis ENGIN",
    ],
  },
  { categoryCode: "ZINGUERIE", items: ["Fournis Gouttière", "Fournis rives et faitages", "Fournis habillage"] },
];

async function main() {
  // Group templates by client so each client is upserted once even if it
  // has several variants.
  const clientNames = Array.from(new Set(TEMPLATES.map((t) => t.client)));

  for (const clientName of clientNames) {
    const { data: client, error: clientError } = await supabase
      .from("commercial_clients")
      .upsert({ name: clientName, name_normalized: normalize(clientName) }, { onConflict: "name" })
      .select("id")
      .single();
    if (clientError) throw clientError;

    const variants = TEMPLATES.filter((t) => t.client === clientName);
    for (const variant of variants) {
      const { data: template, error: templateError } = await supabase
        .from("commercial_checklist_templates")
        .upsert(
          { client_id: client.id, variant_label: variant.variant },
          { onConflict: "client_id,variant_label" }
        )
        .select("id")
        .single();
      if (templateError) throw templateError;

      const { error: deleteError } = await supabase
        .from("commercial_checklist_template_items")
        .delete()
        .eq("template_id", template.id);
      if (deleteError) throw deleteError;

      const rows = variant.items.map((label, i) => ({
        client_id: client.id,
        template_id: template.id,
        category_code: variant.categoryCode,
        position: i + 1,
        label,
        label_normalized: normalize(label),
      }));
      const { error: insertError } = await supabase.from("commercial_checklist_template_items").insert(rows);
      if (insertError) throw insertError;

      console.log(`✓ ${clientName} — ${variant.variant}: ${rows.length} tâches`);
    }
  }

  const { error: deleteAutreError } = await supabase.from("commercial_autre_items").delete().gte("position", 0);
  if (deleteAutreError) throw deleteAutreError;

  let position = 0;
  const autreRows = AUTRE_ITEMS.flatMap((group) =>
    group.items.map((label) => ({
      category_code: group.categoryCode,
      position: ++position,
      label,
      label_normalized: normalize(label),
    }))
  );
  const { error: insertAutreError } = await supabase.from("commercial_autre_items").insert(autreRows);
  if (insertAutreError) throw insertAutreError;
  console.log(`✓ Autres : ${autreRows.length} tâches`);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
