import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireRole } from "@/lib/auth/requireRole";
import { serviceClient } from "@/lib/controle/server";

// Фото ошибки : POST - загрузка (картинка уже уменьшена на телефоне), GET ?path= - ссылка на просмотр.
const NO_STORE = { "Cache-Control": "no-store" };
const BUCKET = "control-photos";

export async function POST(request: NextRequest) {
  const check = await requireRole(["controleur", "rh_admin"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400, headers: NO_STORE });
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return NextResponse.json({ error: "Только фото (jpeg/png/webp)" }, { status: 400, headers: NO_STORE });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "Фото слишком большое" }, { status: 413, headers: NO_STORE });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${check.ctx.userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ path }, { headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const check = await requireRole(["controleur", "rh_admin", "rh", "comptable", "rh_readonly"]);
  if (!check.ok) return check.response;
  const sb = serviceClient();
  if (!sb) return NextResponse.json({ error: "Server misconfigured" }, { status: 500, headers: NO_STORE });
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!path || path.includes("..")) return NextResponse.json({ error: "Некорректный путь" }, { status: 400, headers: NO_STORE });
  if (check.ctx.role === "controleur" && !path.startsWith(`${check.ctx.userId}/`)) return NextResponse.json({ error: "Нет доступа" }, { status: 403, headers: NO_STORE });
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 120);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Не найдено" }, { status: 404, headers: NO_STORE });
  return NextResponse.redirect(data.signedUrl);
}
