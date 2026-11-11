import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import { serviceClient } from "@/lib/controle/server";
import { FILES_BUCKET, MAX_FILE_BYTES, cleanFolder, cleanName, isPriceFile, newStoragePath } from "@/lib/commercial/files";

// Файлы объекта (экран « Объекты » -> вкладка « Файлы »). Роли: commercial, commercial_rh, rh_admin.
//   GET    ?objectId=            - список файлов объекта (метаданные)
//   GET    ?fileId=              - скачать (редирект на подписанную ссылку)
//   POST   { action: "sign",     object_id, folder, name, size, mime }  - ссылка для прямой загрузки в хранилище
//   POST   { action: "register", object_id, storage_path, folder, name, size, mime } - записать загруженный файл
//   DELETE ?fileId=              - удалить файл
const NO_STORE = { "Cache-Control": "no-store" };
const ROLES = ["commercial", "commercial_rh", "rh_admin"] as const;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });
const LIST_COLS = "id, folder, name, size_bytes, mime, taken_at, created_at, source, team_visible";

export async function GET(request: NextRequest) {
  const check = await requireRole(ROLES);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);

  const fileId = request.nextUrl.searchParams.get("fileId");
  if (fileId) {
    const { data: f } = await sb.from("work_object_files").select("storage_path, name").eq("id", fileId).maybeSingle();
    if (!f) return bad("Файл не найден", 404);
    const { data, error } = await sb.storage.from(FILES_BUCKET).createSignedUrl(f.storage_path as string, 300, { download: f.name as string });
    if (error || !data) return bad(error?.message ?? "Не найдено", 404);
    return NextResponse.redirect(data.signedUrl);
  }

  const objectId = request.nextUrl.searchParams.get("objectId");
  if (!objectId) return bad("Не указан объект");
  const { data, error } = await sb.from("work_object_files").select(LIST_COLS).eq("object_id", objectId).order("folder").order("name").limit(5000);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ files: data ?? [] }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const check = await requireRole(ROLES);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);
  const body = (await request.json().catch(() => null)) as { action?: string; object_id?: string; storage_path?: string; folder?: string; name?: string; size?: number; mime?: string } | null;
  if (!body?.object_id) return bad("Не указан объект");
  const name = cleanName(body.name);
  if (!name) return bad("Нет имени файла");
  const size = Number(body.size ?? 0);
  if (size > MAX_FILE_BYTES) return bad(`Файл больше ${Math.round(MAX_FILE_BYTES / 1048576)} МБ - загрузить нельзя`, 413);

  const { data: obj } = await sb.from("work_objects").select("id").eq("id", body.object_id).maybeSingle();
  if (!obj) return bad("Объект не найден", 404);

  if (body.action === "sign") {
    const path = newStoragePath(body.object_id, name);
    const { data, error } = await sb.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return bad(error?.message ?? "Не удалось подготовить загрузку", 500);
    return NextResponse.json({ path, token: data.token }, { headers: NO_STORE });
  }

  if (body.action === "register") {
    const path = String(body.storage_path ?? "");
    if (!path.startsWith(`${body.object_id}/`) || path.includes("..")) return bad("Некорректный путь файла");
    const { error } = await sb.from("work_object_files").insert({
      object_id: body.object_id,
      storage_path: path,
      folder: cleanFolder(body.folder),
      name,
      size_bytes: size || null,
      mime: String(body.mime ?? "").slice(0, 100) || null,
      source: "app",
      uploaded_by: check.ctx.email,
      team_visible: !isPriceFile(cleanFolder(body.folder), name),
    });
    if (error) return bad("Не удалось записать файл: " + error.message, 500);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  return bad("Неизвестное действие");
}

/** Видимость для бригады: { object_id, visible, file_id? | folder? } - один файл или вся папка (с вложенными). */
export async function PATCH(request: NextRequest) {
  const check = await requireRole(ROLES);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);
  const body = (await request.json().catch(() => null)) as { object_id?: string; visible?: boolean; file_id?: string; folder?: string } | null;
  if (!body?.object_id || typeof body.visible !== "boolean") return bad("Некорректный запрос");
  if (body.file_id) {
    const { error } = await sb.from("work_object_files").update({ team_visible: body.visible }).eq("id", body.file_id).eq("object_id", body.object_id);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  const folder = cleanFolder(body.folder);
  let q = sb.from("work_object_files").update({ team_visible: body.visible }).eq("object_id", body.object_id);
  if (folder) q = q.or(`folder.eq.${folder.replace(/[,()]/g, "")},folder.like.${folder.replace(/[,()%_]/g, "")}/%`);
  const { error } = await q;
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const check = await requireRole(ROLES);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);
  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) return bad("Не указан файл");
  const { data: f } = await sb.from("work_object_files").select("storage_path").eq("id", fileId).maybeSingle();
  if (!f) return bad("Файл не найден", 404);
  await sb.storage.from(FILES_BUCKET).remove([f.storage_path as string]);
  const { error } = await sb.from("work_object_files").delete().eq("id", fileId);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
