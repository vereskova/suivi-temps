import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PENALTY_DOC, sanitizeCatalogDoc, type PenaltyCatalogDoc } from "@/lib/payroll/penalties";

export type PublishedCatalog = {
  /** 0 = встроенный справочник из кода (в базе ещё нет опубликованных версий) */
  version: number;
  doc: PenaltyCatalogDoc;
  publishedAt: string | null;
  publishedBy: string | null;
};

const BUILTIN: PublishedCatalog = { version: 0, doc: DEFAULT_PENALTY_DOC, publishedAt: null, publishedBy: null };

/** Действующий справочник = последняя опубликованная версия. При любой проблеме (нет таблицы, нет версий,
 *  битые данные) - встроенный справочник, чтобы контролёр никогда не остался без списка. */
export async function loadPublishedCatalog(sb: SupabaseClient): Promise<PublishedCatalog> {
  try {
    const { data, error } = await sb
      .from("penalty_catalog_versions")
      .select("version, data, published_at, published_by_email")
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return BUILTIN;
    const parsed = sanitizeCatalogDoc(data.data);
    if (!parsed.ok) return BUILTIN;
    return { version: Number(data.version), doc: parsed.doc, publishedAt: (data.published_at as string) ?? null, publishedBy: (data.published_by_email as string) ?? null };
  } catch {
    return BUILTIN;
  }
}
