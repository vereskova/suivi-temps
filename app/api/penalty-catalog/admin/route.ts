import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { loadPublishedCatalog } from "@/lib/controle/catalog";
import { serviceClient } from "@/lib/controle/server";
import { sanitizeCatalogDoc, type PenaltyCatalogDoc } from "@/lib/payroll/penalties";

// Редактирование справочника штрафов офисом : черновик -> « Подтвердить » -> новая версия для всех.
// Роли : rh_admin, rh, rh_readonly (Production).

const NO_STORE = { "Cache-Control": "no-store" };
const EDITORS = ["rh_admin", "rh", "rh_readonly"] as const;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });

type Row = { id: string; version: number | null; status: string; data: unknown; note: string | null; created_by_email: string | null; updated_at: string; published_by_email: string | null; published_at: string | null };

async function loadDraft(sb: NonNullable<ReturnType<typeof serviceClient>>) {
  const { data } = await sb.from("penalty_catalog_versions").select("id, version, status, data, note, created_by_email, updated_at, published_by_email, published_at").eq("status", "draft").maybeSingle();
  return (data as Row | null) ?? null;
}

export async function GET() {
  const check = await requireRole(EDITORS);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);

  const published = await loadPublishedCatalog(sb);
  const draftRow = await loadDraft(sb);
  const draftParsed = draftRow ? sanitizeCatalogDoc(draftRow.data) : null;
  const { data: history, error } = await sb
    .from("penalty_catalog_versions")
    .select("version, note, published_by_email, published_at")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(30);
  if (error) return bad("Не найдена таблица справочника. Нужно выполнить миграцию 0134: " + error.message, 500);

  return NextResponse.json(
    {
      published,
      draft: draftRow && draftParsed?.ok ? { doc: draftParsed.doc, updatedAt: draftRow.updated_at, by: draftRow.created_by_email } : null,
      history: history ?? [],
    },
    { headers: NO_STORE }
  );
}

/** Сохранить черновик (создаётся при первой правке). */
export async function PUT(request: NextRequest) {
  const check = await requireRole(EDITORS);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);
  const body = (await request.json().catch(() => null)) as { doc?: PenaltyCatalogDoc } | null;
  const parsed = sanitizeCatalogDoc(body?.doc);
  if (!parsed.ok) return bad(parsed.error);

  const now = new Date().toISOString();
  const existing = await loadDraft(sb);
  if (existing) {
    const { error } = await sb.from("penalty_catalog_versions").update({ data: parsed.doc, updated_at: now }).eq("id", existing.id);
    if (error) return bad("Не удалось сохранить: " + error.message, 500);
  } else {
    const { error } = await sb.from("penalty_catalog_versions").insert({ status: "draft", data: parsed.doc, created_by_email: check.ctx.email });
    if (error) return bad("Не удалось сохранить: " + error.message, 500);
  }
  return NextResponse.json({ ok: true, updatedAt: now }, { headers: NO_STORE });
}

/** action = "publish" (подтвердить для всех) | "discard" (отбросить черновик) | "restore" (версию - в черновик). */
export async function POST(request: NextRequest) {
  const check = await requireRole(EDITORS);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);
  const body = (await request.json().catch(() => null)) as { action?: string; version?: number; note?: string; doc?: PenaltyCatalogDoc } | null;
  if (!body) return bad("Некорректный запрос");

  if (body.action === "discard") {
    await sb.from("penalty_catalog_versions").delete().eq("status", "draft");
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  if (body.action === "restore") {
    const v = Number(body.version);
    if (!(v > 0)) return bad("Не указана версия");
    const { data: row } = await sb.from("penalty_catalog_versions").select("data").eq("status", "published").eq("version", v).maybeSingle();
    if (!row) return bad("Версия не найдена", 404);
    const parsed = sanitizeCatalogDoc(row.data);
    if (!parsed.ok) return bad(parsed.error);
    await sb.from("penalty_catalog_versions").delete().eq("status", "draft");
    const { error } = await sb.from("penalty_catalog_versions").insert({ status: "draft", data: parsed.doc, created_by_email: check.ctx.email, note: `восстановлено из версии ${v}` });
    if (error) return bad("Не удалось восстановить: " + error.message, 500);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  if (body.action === "publish") {
    // Публикуется ровно то, что сейчас на экране (оно же пересохраняется как черновик), с повторной проверкой.
    const parsed = sanitizeCatalogDoc(body.doc);
    if (!parsed.ok) return bad(parsed.error);
    const { data: last } = await sb.from("penalty_catalog_versions").select("version").eq("status", "published").order("version", { ascending: false }).limit(1).maybeSingle();
    const nextVersion = Number(last?.version ?? 0) + 1;
    const now = new Date().toISOString();
    const { error } = await sb.from("penalty_catalog_versions").insert({
      status: "published",
      version: nextVersion,
      data: parsed.doc,
      note: String(body.note ?? "").trim().slice(0, 300) || null,
      created_by_email: check.ctx.email,
      published_by_email: check.ctx.email,
      published_at: now,
    });
    if (error) return bad("Не удалось опубликовать: " + error.message, 500);
    await sb.from("penalty_catalog_versions").delete().eq("status", "draft");
    return NextResponse.json({ ok: true, version: nextVersion }, { headers: NO_STORE });
  }

  return bad("Неизвестное действие");
}
