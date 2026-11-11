import { randomUUID } from "crypto";

export const FILES_BUCKET = "object-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // лимит Storage проекта (50 МБ)

export type ObjectFileRow = { id: string; folder: string; name: string; size_bytes: number | null; mime: string | null; taken_at: string | null; created_at: string; source: string; team_visible?: boolean };

/** Очистка пути папки: без « .. », без лишних слэшей, не длиннее 300 символов. */
export function cleanFolder(raw: unknown): string {
  return String(raw ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .join("/")
    .slice(0, 300);
}
export function cleanName(raw: unknown): string {
  return String(raw ?? "").replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200);
}
/** Непрозрачный ключ в хранилище: исходное имя (с любыми символами) хранится только в таблице. */
export function newStoragePath(objectId: string, name: string): string {
  const ext = (name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "bin").toLowerCase();
  return `${objectId}/${randomUUID()}.${ext}`;
}

/** Файлы с ценами (сметы, заказы, счета) по имени файла или папки - по умолчанию скрываются от бригады. */
const PRICE_RE = /(\bd[ée]vis\b|\bsmeta\b|смет|\bprix\b|\btarif|\boffre\b|\bquote\b|factur|bon[ _-]?de[ _-]?commande|\bbdc\b|chiffrage|\bcommande\b|\bbudget\b|\bmarge\b)/i;
export function isPriceFile(folder: string, name: string): boolean {
  return PRICE_RE.test(`${folder}/${name}`.normalize("NFC"));
}
