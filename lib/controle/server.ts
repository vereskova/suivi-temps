import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

/** Client service-role pour les routes /api/controle (le contrôleur n'a aucun accès direct aux tables). */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-11-09" -> "09/11" */
export function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function monthStartIso(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

export function prevMonthStartIso(dateIso: string): string {
  const y = Number(dateIso.slice(0, 4));
  const m = Number(dateIso.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** run Primes & Bonus du mois (créé s'il n'existe pas, comme l'écran RH). */
export async function ensureRun(sb: SupabaseClient, monthIso: string): Promise<string> {
  const { data: existing } = await sb.from("payroll_runs").select("id").eq("month", monthIso).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await sb.from("payroll_runs").insert({ month: monthIso }).select("id").single();
  if (error || !created) {
    // course possible avec l'écran RH : on relit
    const { data: again } = await sb.from("payroll_runs").select("id").eq("month", monthIso).maybeSingle();
    if (again?.id) return again.id as string;
    throw new Error(error?.message ?? "payroll_runs insert failed");
  }
  return created.id as string;
}

/**
 * Ajoute `delta` (négatif = штраф, positif = annulation) au « Штраф контроль » d'un salarié pour le mois
 * et ajoute `lines` à la raison. Même effet que la saisie manuelle dans Primes & Bonus (l'écran RH
 * le voit en direct). Nouvelle ligne : on reprend la Ставка du mois précédent, comme l'écran RH.
 */
export async function applyToExtras(
  sb: SupabaseClient,
  args: { runId: string; prevRunId: string | null; employeeId: string; delta: number; lines: string; email: string }
): Promise<void> {
  const { runId, prevRunId, employeeId, delta, lines, email } = args;
  const at = new Date().toISOString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error: readErr } = await sb
      .from("payroll_extras")
      .select("id, penalite_montant, penalite_raison")
      .eq("run_id", runId)
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    if (!row) {
      let taux = 0;
      if (prevRunId) {
        const { data: prev } = await sb
          .from("payroll_extras")
          .select("taux_journalier")
          .eq("run_id", prevRunId)
          .eq("employee_id", employeeId)
          .maybeSingle();
        taux = Number(prev?.taux_journalier) || 0;
      }
      const { error } = await sb.from("payroll_extras").insert({
        run_id: runId,
        employee_id: employeeId,
        taux_journalier: taux,
        penalite_montant: r2(delta),
        penalite_raison: lines,
        penalite_raison_by: email,
        penalite_raison_at: at,
      });
      if (!error) return;
      continue; // ligne créée entre-temps par quelqu'un d'autre -> on relit
    }

    const current = Number(row.penalite_montant) || 0;
    const { data: updated, error } = await sb
      .from("payroll_extras")
      .update({
        penalite_montant: r2(current + delta),
        penalite_raison: [row.penalite_raison, lines].filter(Boolean).join("\n"),
        penalite_raison_by: email,
        penalite_raison_at: at,
      })
      .eq("id", row.id)
      .eq("penalite_montant", row.penalite_montant) // verrou optimiste
      .select("id");
    if (error) throw new Error(error.message);
    if (updated && updated.length > 0) return;
  }
  throw new Error("payroll_extras: écritures concurrentes, réessayez");
}
