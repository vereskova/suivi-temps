import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/requireRole";
import { requireBrigadir } from "@/lib/brigadir/access";
import { serviceClient } from "@/lib/controle/server";
import { FILES_BUCKET, MAX_FILE_BYTES, cleanFolder, cleanName, isPriceFile, newStoragePath } from "@/lib/commercial/files";
import { STATUS_FOLDERS, statusKey, statusLabel, teamFolderName, type FsFile, type FsFolder, type FsListing, type StatusKey } from "@/lib/files/tree";

// Файловая система объектов, как в iCloud: Корень -> KOMANDA_N -> статус -> объект -> папки -> файлы.
// Офис (rh_admin, rh, rh_readonly, commercial, commercial_rh) видит все команды; бригадир - только свою папку команды
// (и только файлы, не скрытые от бригады). Бригадир может создавать папки и загружать файлы/фото внутри объектов,
// но не удалять и не менять статус объектов.
//   GET    ?path=a/b/c            - содержимое папки
//   GET    ?fileId=               - скачать файл (редирект на подписанную ссылку)
//   POST   { action: "mkdir", path, name, ifExists? }                          - новая папка (в статусе = новый объект)
//   POST   { action: "sign",     path, name, size, mime }                       - ссылка для прямой загрузки файла
//   POST   { action: "register", path, storage_path, name, size, mime }        - записать загруженный файл
//   POST   { action: "move",     path, to_status }                              - перенести объект в другую папку статуса
//   PATCH  { path, visible, file_id? }                                          - видимость для бригады (файл или папка)
//   DELETE ?fileId=  |  ?path=a/b/c                                             - удалить файл / папку (объект целиком, если путь = объект)

const NO_STORE = { "Cache-Control": "no-store" };
const OFFICE = ["rh_admin", "rh", "rh_readonly", "commercial", "commercial_rh"] as const;
const OFFICE_DELETE = ["rh_admin", "rh", "commercial", "commercial_rh"];
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });

type Team = { id: string; name: string };
type Access = { sb: SupabaseClient; email: string; brigade: boolean; canDelete: boolean; teams: Team[] };

const teamNum = (name: string) => Number(name.replace(/\D+/g, "")) || 999;

async function getAccess(): Promise<Access | NextResponse> {
  const check = await requireRole([...OFFICE, "brigadir"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return bad("Server misconfigured", 500);
  if (check.ctx.role === "brigadir") {
    const acc = await requireBrigadir();
    if (!acc.ok) return acc.response as NextResponse;
    return { sb, email: acc.email, brigade: true, canDelete: false, teams: acc.teams };
  }
  const { data } = await sb.from("teams").select("id, name").eq("active", true);
  const teams = ((data ?? []) as Team[]).sort((a, b) => teamNum(a.name) - teamNum(b.name));
  return { sb, email: check.ctx.email, brigade: false, canDelete: OFFICE_DELETE.includes(check.ctx.role), teams };
}

type ObjectRow = { id: string; name: string; team_id: string | null; status: string };
type Resolved = { level: number; team?: Team; status?: StatusKey; object?: ObjectRow; sub: string };

/** Разбор пути: 0 корень, 1 команда, 2 статус, 3 объект, 4+ папка внутри объекта. */
async function resolve(a: Access, segs: string[]): Promise<Resolved | NextResponse> {
  if (segs.length === 0) return { level: 0, sub: "" };
  const team = a.teams.find((t) => teamFolderName(t.name) === segs[0]);
  if (!team) return bad("Папка не найдена", 404);
  if (segs.length === 1) return { level: 1, team, sub: "" };
  const status = statusKey(segs[1]);
  if (!status) return bad("Папка не найдена", 404);
  if (segs.length === 2) return { level: 2, team, status, sub: "" };
  const { data: obj } = await a.sb.from("work_objects").select("id, name, team_id, status").eq("team_id", team.id).eq("status", status).eq("name", segs[2]).maybeSingle();
  if (!obj) return bad("Папка не найдена", 404);
  const sub = cleanFolder(segs.slice(3).join("/"));
  return { level: 3 + (sub ? sub.split("/").length : 0), team, status, object: obj as ObjectRow, sub };
}

const parsePath = (raw: unknown): string[] =>
  String(raw ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..");

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });
const byName = (x: { name: string }, y: { name: string }) => collator.compare(x.name, y.name);

export async function GET(request: NextRequest) {
  const a = await getAccess();
  if (a instanceof NextResponse) return a;

  // Скачивание файла
  const fileId = request.nextUrl.searchParams.get("fileId");
  if (fileId) {
    const { data: f } = await a.sb.from("work_object_files").select("storage_path, name, team_visible, work_objects!inner(team_id)").eq("id", fileId).maybeSingle();
    const teamId = (f?.work_objects as unknown as { team_id: string | null } | null)?.team_id;
    if (!f || (a.brigade && !f.team_visible) || !teamId || !a.teams.some((t) => t.id === teamId)) return bad("Файл не найден", 404);
    const { data, error } = await a.sb.storage.from(FILES_BUCKET).createSignedUrl(f.storage_path as string, 300, { download: f.name as string });
    if (error || !data) return bad(error?.message ?? "Не найдено", 404);
    return NextResponse.redirect(data.signedUrl);
  }

  const segs = parsePath(request.nextUrl.searchParams.get("path"));
  const r = await resolve(a, segs);
  if (r instanceof NextResponse) return r;

  const listing: FsListing = {
    path: segs,
    level: r.level,
    folders: [],
    files: [],
    canMkdir: false,
    canUploadFiles: false,
    canUploadFolders: false,
    canManage: !a.brigade,
  };

  if (r.level === 0) {
    const ids = a.teams.map((t) => t.id);
    const { data } = ids.length ? await a.sb.from("work_objects").select("team_id").in("team_id", ids).limit(5000) : { data: [] };
    const counts = new Map<string, number>();
    (data ?? []).forEach((o) => counts.set(o.team_id as string, (counts.get(o.team_id as string) ?? 0) + 1));
    listing.folders = a.teams.map((t) => ({ name: teamFolderName(t.name), count: counts.get(t.id) ?? 0 }));
  } else if (r.level === 1) {
    const { data } = await a.sb.from("work_objects").select("status").eq("team_id", r.team!.id).limit(5000);
    const counts = new Map<string, number>();
    (data ?? []).forEach((o) => counts.set(o.status as string, (counts.get(o.status as string) ?? 0) + 1));
    listing.folders = STATUS_FOLDERS.map((s) => ({ name: s.label, count: counts.get(s.key) ?? 0 }));
  } else if (r.level === 2) {
    const { data } = await a.sb.from("work_objects").select("name").eq("team_id", r.team!.id).eq("status", r.status!).order("name").limit(2000);
    listing.folders = (data ?? []).map((o) => ({ name: o.name as string })).sort(byName);
    listing.canMkdir = !a.brigade; // новая папка здесь = новый объект
    listing.canUploadFolders = !a.brigade; // загрузка папки здесь = новый объект с файлами
  } else {
    const obj = r.object!;
    let fq = a.sb.from("work_object_files").select("id, folder, name, size_bytes, mime, taken_at, created_at, team_visible").eq("object_id", obj.id).order("name").limit(8000);
    if (a.brigade) fq = fq.eq("team_visible", true);
    const [{ data: files }, { data: dirs }] = await Promise.all([fq, a.sb.from("work_object_folders").select("path, team_visible").eq("object_id", obj.id).limit(2000)]);
    const prefix = r.sub ? r.sub + "/" : "";
    const sub = new Map<string, { count: number; hidden: boolean }>();
    const touch = (name: string, add: number, hidden: boolean) => {
      const cur = sub.get(name) ?? { count: 0, hidden: true };
      sub.set(name, { count: cur.count + add, hidden: cur.hidden && hidden });
    };
    const items: FsFile[] = [];
    for (const f of files ?? []) {
      const folder = (f.folder as string) ?? "";
      if (folder === r.sub) {
        items.push({ id: f.id, name: f.name, size_bytes: f.size_bytes, mime: f.mime, taken_at: f.taken_at, created_at: f.created_at, team_visible: f.team_visible });
      } else if (folder.startsWith(prefix)) {
        touch(folder.slice(prefix.length).split("/")[0], 1, f.team_visible === false);
      }
    }
    for (const d of dirs ?? []) {
      const p = d.path as string;
      if (a.brigade && d.team_visible === false) continue;
      if (p === r.sub || !p.startsWith(prefix)) continue;
      touch(p.slice(prefix.length).split("/")[0], 0, d.team_visible === false);
    }
    listing.folders = Array.from(sub, ([name, v]): FsFolder => ({ name, count: v.count, hidden: !a.brigade && v.hidden && v.count > 0 })).sort(byName);
    listing.files = items.sort(byName);
    listing.canMkdir = true;
    listing.canUploadFiles = true;
    listing.canUploadFolders = true;
  }
  return NextResponse.json(listing, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const a = await getAccess();
  if (a instanceof NextResponse) return a;
  const body = (await request.json().catch(() => null)) as { action?: string; path?: string; name?: string; ifExists?: string; size?: number; mime?: string; storage_path?: string; to_status?: string } | null;
  if (!body?.action) return bad("Некорректный запрос");
  const segs = parsePath(body.path);
  const r = await resolve(a, segs);
  if (r instanceof NextResponse) return r;

  if (body.action === "mkdir") {
    const name = cleanName(body.name);
    if (!name || name === "." || name === "..") return bad("Введите название папки");
    if (r.level === 2) {
      if (a.brigade) return bad("Новые объекты создаёт офис", 403);
      const { data: dup } = await a.sb.from("work_objects").select("id, status").eq("team_id", r.team!.id).eq("name", name).limit(1);
      if (dup && dup.length) {
        if (body.ifExists === "ok" && dup[0].status === r.status) return NextResponse.json({ ok: true, existed: true }, { headers: NO_STORE });
        return bad(`Папка «${name}» уже есть у этой команды${dup[0].status !== r.status ? ` (в «${statusLabel(dup[0].status as string)}»)` : ""}`, 409);
      }
      const { error } = await a.sb.from("work_objects").insert({ name, team_id: r.team!.id, status: r.status, created_by_email: a.email });
      if (error) return bad("Не удалось создать: " + error.message, 500);
      return NextResponse.json({ ok: true, existed: false }, { headers: NO_STORE });
    }
    if (r.level >= 3) {
      const path = cleanFolder(`${r.sub}/${name}`);
      const { error } = await a.sb.from("work_object_folders").upsert({ object_id: r.object!.id, path, created_by: a.email }, { onConflict: "object_id,path", ignoreDuplicates: true });
      if (error) return bad("Не удалось создать: " + error.message, 500);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    return bad("Здесь нельзя создать папку. Откройте папку статуса (En cours, A venir…).");
  }

  if (body.action === "sign" || body.action === "register") {
    if (r.level < 3) return bad("Файлы можно загружать только внутрь папки объекта");
    const name = cleanName(body.name);
    if (!name) return bad("Нет имени файла");
    const size = Number(body.size ?? 0);
    if (size > MAX_FILE_BYTES) return bad(`Файл больше ${Math.round(MAX_FILE_BYTES / 1048576)} МБ - загрузить нельзя`, 413);
    const objectId = r.object!.id;
    if (body.action === "sign") {
      const path = newStoragePath(objectId, name);
      const { data, error } = await a.sb.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
      if (error || !data) return bad(error?.message ?? "Не удалось подготовить загрузку", 500);
      return NextResponse.json({ path, token: data.token }, { headers: NO_STORE });
    }
    const spath = String(body.storage_path ?? "");
    if (!spath.startsWith(`${objectId}/`) || spath.includes("..")) return bad("Некорректный путь файла");
    const { error } = await a.sb.from("work_object_files").insert({
      object_id: objectId,
      storage_path: spath,
      folder: r.sub,
      name,
      size_bytes: size || null,
      mime: String(body.mime ?? "").slice(0, 100) || null,
      source: "app",
      uploaded_by: a.email,
      team_visible: a.brigade ? true : !isPriceFile(r.sub, name),
    });
    if (error) return bad("Не удалось записать файл: " + error.message, 500);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  if (body.action === "move") {
    if (a.brigade) return bad("Недоступно", 403);
    if (r.level !== 3 || !r.object) return bad("Переносить можно только папку объекта");
    const to = statusKey(String(body.to_status ?? "")) ?? (STATUS_FOLDERS.some((s) => s.key === body.to_status) ? (body.to_status as StatusKey) : null);
    if (!to) return bad("Неизвестная папка статуса");
    const { error } = await a.sb.from("work_objects").update({ status: to, updated_at: new Date().toISOString() }).eq("id", r.object.id);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  return bad("Неизвестное действие");
}

/** Видимость для бригады: { path, visible, file_id? } - один файл либо вся папка (с вложенными). */
export async function PATCH(request: NextRequest) {
  const a = await getAccess();
  if (a instanceof NextResponse) return a;
  if (a.brigade) return bad("Недоступно", 403);
  const body = (await request.json().catch(() => null)) as { path?: string; visible?: boolean; file_id?: string } | null;
  if (typeof body?.visible !== "boolean") return bad("Некорректный запрос");
  const r = await resolve(a, parsePath(body.path));
  if (r instanceof NextResponse) return r;
  if (r.level < 3 || !r.object) return bad("Недоступно на этом уровне");
  const oid = r.object.id;
  if (body.file_id) {
    const { error } = await a.sb.from("work_object_files").update({ team_visible: body.visible }).eq("id", body.file_id).eq("object_id", oid);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  const like = r.sub.replace(/[,()%_]/g, "");
  const orFolder = r.sub ? `folder.eq.${r.sub.replace(/[,()]/g, "")},folder.like.${like}/%` : "";
  let fq = a.sb.from("work_object_files").update({ team_visible: body.visible }).eq("object_id", oid);
  if (orFolder) fq = fq.or(orFolder);
  const { error } = await fq;
  if (error) return bad(error.message, 500);
  if (r.sub) {
    await a.sb.from("work_object_folders").update({ team_visible: body.visible }).eq("object_id", oid).or(`path.eq.${r.sub.replace(/[,()]/g, "")},path.like.${like}/%`);
  } else {
    await a.sb.from("work_object_folders").update({ team_visible: body.visible }).eq("object_id", oid);
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

async function removeStorage(sb: SupabaseClient, paths: string[]) {
  for (let i = 0; i < paths.length; i += 500) await sb.storage.from(FILES_BUCKET).remove(paths.slice(i, i + 500));
}

export async function DELETE(request: NextRequest) {
  const a = await getAccess();
  if (a instanceof NextResponse) return a;
  if (a.brigade || !a.canDelete) return bad("Удалять может только офис", 403);

  const fileId = request.nextUrl.searchParams.get("fileId");
  if (fileId) {
    const { data: f } = await a.sb.from("work_object_files").select("storage_path").eq("id", fileId).maybeSingle();
    if (!f) return bad("Файл не найден", 404);
    await removeStorage(a.sb, [f.storage_path as string]);
    const { error } = await a.sb.from("work_object_files").delete().eq("id", fileId);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const r = await resolve(a, parsePath(request.nextUrl.searchParams.get("path")));
  if (r instanceof NextResponse) return r;
  if (r.level < 3 || !r.object) return bad("Эту папку удалить нельзя");
  const oid = r.object.id;

  // Файлы папки (или всего объекта)
  let fq = a.sb.from("work_object_files").select("id, storage_path").eq("object_id", oid).limit(10000);
  if (r.sub) fq = fq.or(`folder.eq.${r.sub.replace(/[,()]/g, "")},folder.like.${r.sub.replace(/[,()%_]/g, "")}/%`);
  const { data: files } = await fq;
  await removeStorage(a.sb, (files ?? []).map((f) => f.storage_path as string));

  if (!r.sub) {
    const { error } = await a.sb.from("work_objects").delete().eq("id", oid); // каскад: файлы, папки, сметы, контрандю
    if (error) return bad(error.message, 500);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  const ids = (files ?? []).map((f) => f.id as string);
  for (let i = 0; i < ids.length; i += 200) await a.sb.from("work_object_files").delete().in("id", ids.slice(i, i + 200));
  await a.sb.from("work_object_folders").delete().eq("object_id", oid).or(`path.eq.${r.sub.replace(/[,()]/g, "")},path.like.${r.sub.replace(/[,()%_]/g, "")}/%`);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
