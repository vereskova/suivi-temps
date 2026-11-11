import { NextRequest, NextResponse } from "next/server";
import { requireBrigadir } from "@/lib/brigadir/access";
import { FILES_BUCKET } from "@/lib/commercial/files";

// Бригадир: файлы объектов СВОЕЙ команды (только чтение: список и скачивание).
const NO_STORE = { "Cache-Control": "no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function GET(request: NextRequest) {
  const acc = await requireBrigadir();
  if (!acc.ok) return acc.response as NextResponse;

  const fileId = request.nextUrl.searchParams.get("fileId");
  if (fileId) {
    const { data: f } = await acc.sb.from("work_object_files").select("storage_path, name, team_visible, work_objects!inner(team_id)").eq("id", fileId).maybeSingle();
    const teamId = (f?.work_objects as unknown as { team_id: string | null } | null)?.team_id;
    if (!f || !f.team_visible || !teamId || !acc.teams.some((t) => t.id === teamId)) return bad("Файл не найден", 404);
    const { data, error } = await acc.sb.storage.from(FILES_BUCKET).createSignedUrl(f.storage_path as string, 300, { download: f.name as string });
    if (error || !data) return bad(error?.message ?? "Не найдено", 404);
    return NextResponse.redirect(data.signedUrl);
  }

  const objectId = request.nextUrl.searchParams.get("objectId");
  if (!objectId) return bad("Не указан объект");
  const { data: obj } = await acc.sb.from("work_objects").select("id, team_id").eq("id", objectId).maybeSingle();
  if (!obj || !acc.teams.some((t) => t.id === obj.team_id)) return bad("Объект не найден", 404);
  const { data, error } = await acc.sb.from("work_object_files").select("id, folder, name, size_bytes, mime, taken_at, created_at, source").eq("object_id", objectId).eq("team_visible", true).order("folder").order("name").limit(5000);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ files: data ?? [] }, { headers: NO_STORE });
}
