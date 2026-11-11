"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, Eye, EyeOff, File as FileIcon, FileImage, FileSpreadsheet, FileText, Film, Folder, Home, Search, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Файлы объекта: папки внутри объекта (Plans, Photo, RP, PPSPS, Compte rendu…) как в iCloud.
// Офис: просмотр, загрузка и удаление. Бригадир: только просмотр и скачивание (api = /api/brigadir/files).

type FileRow = { id: string; folder: string; name: string; size_bytes: number | null; mime: string | null; taken_at: string | null; created_at: string; source: string; team_visible?: boolean };

const MAX_BYTES = 50 * 1024 * 1024;
const PAGE = 120;

const sizeText = (n: number | null) => {
  if (n == null) return "";
  if (n < 1024) return `${n} Б`;
  if (n < 1048576) return `${Math.round(n / 1024)} КБ`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1).replace(".", ",")} МБ`;
  return `${(n / 1073741824).toFixed(1).replace(".", ",")} ГБ`;
};
const dateText = (f: FileRow) => {
  const iso = f.taken_at ?? f.created_at;
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "";
};
function iconFor(f: FileRow) {
  const n = f.name.toLowerCase();
  if (/\.(jpe?g|png|heic|heif|webp|gif)$/.test(n) || f.mime?.startsWith("image/")) return FileImage;
  if (/\.(mp4|mov|m4v|avi)$/.test(n) || f.mime?.startsWith("video/")) return Film;
  if (/\.(xlsx?|numbers|csv)$/.test(n)) return FileSpreadsheet;
  if (/\.(pdf|docx?|pages|txt)$/.test(n)) return FileText;
  return FileIcon;
}

export default function ObjectFilesBrowser({ api, objectId, canEdit }: { api: string; objectId: string; canEdit: boolean }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${api}?objectId=${objectId}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { files?: FileRow[]; error?: string };
    if (!res.ok) return setError(json.error ?? "Ошибка загрузки");
    setFiles(json.files ?? []);
    setError(null);
  }, [api, objectId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const q = search.trim().toLowerCase();

  // подпапки текущего уровня + файлы текущей папки
  const view = useMemo(() => {
    const all = files ?? [];
    if (q) return { folders: [] as { name: string; count: number }[], items: all.filter((f) => `${f.folder}/${f.name}`.toLowerCase().includes(q)) };
    const prefix = folder ? folder + "/" : "";
    const counts = new Map<string, number>();
    const items: FileRow[] = [];
    for (const f of all) {
      if (f.folder === folder) items.push(f);
      else if (f.folder.startsWith(prefix) && (folder === "" || f.folder.startsWith(prefix))) {
        const next = f.folder.slice(prefix.length).split("/")[0];
        if (next) counts.set(next, (counts.get(next) ?? 0) + 1);
      }
    }
    return { folders: Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true })), items };
  }, [files, folder, q]);

  async function uploadFiles(list: File[]) {
    if (!canEdit || list.length === 0) return;
    const supabase = createClient();
    setBusy({ done: 0, total: list.length });
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      try {
        if (f.size > MAX_BYTES) throw new Error(`«${f.name}»: больше 50 МБ`);
        const sign = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sign", object_id: objectId, folder, name: f.name, size: f.size, mime: f.type }) });
        const s = (await sign.json()) as { path?: string; token?: string; error?: string };
        if (!sign.ok || !s.path || !s.token) throw new Error(s.error ?? "Не удалось начать загрузку");
        const up = await supabase.storage.from("object-files").uploadToSignedUrl(s.path, s.token, f, { contentType: f.type || undefined });
        if (up.error) throw new Error(up.error.message);
        const reg = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", object_id: objectId, storage_path: s.path, folder, name: f.name, size: f.size, mime: f.type }) });
        if (!reg.ok) throw new Error(((await reg.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось записать файл");
      } catch (e) {
        failed++;
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      }
      setBusy({ done: i + 1, total: list.length });
    }
    setBusy(null);
    if (failed === 0) setError(null);
    await load();
  }
  /** Видно ли бригаде: один файл или вся текущая папка. */
  async function setVisible(target: { file?: FileRow; folder?: string }, visible: boolean) {
    const res = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ object_id: objectId, visible, file_id: target.file?.id, folder: target.folder }) });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось изменить");
    setFiles((prev) =>
      (prev ?? []).map((f) => {
        if (target.file) return f.id === target.file.id ? { ...f, team_visible: visible } : f;
        const t = target.folder ?? "";
        return t === "" || f.folder === t || f.folder.startsWith(t + "/") ? { ...f, team_visible: visible } : f;
      })
    );
  }
  async function remove(f: FileRow) {
    if (!window.confirm(`Удалить файл «${f.name}»?`)) return;
    const res = await fetch(`${api}?fileId=${f.id}`, { method: "DELETE" });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось удалить");
    setFiles((prev) => (prev ?? []).filter((x) => x.id !== f.id));
  }

  if (error && files === null) return <p className="rounded-xl bg-error-50 p-4 text-[15px] text-error-700">{error}</p>;
  if (files === null) return <p className="text-stone-500">Загрузка…</p>;

  const crumbs = folder ? folder.split("/") : [];
  const shown = view.items.slice(0, limit);

  return (
    <div
      className={`space-y-3 rounded-2xl ${drag ? "ring-2 ring-primary-400" : ""}`}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setDrag(false);
        uploadFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-[15px] outline-none focus:border-primary-500" placeholder="Найти файл по имени…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {canEdit && (
          <>
            <input ref={input} type="file" multiple className="hidden" onChange={(e) => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            <button type="button" className="btn btn-primary gap-1.5 px-3 py-2 text-[15px]" disabled={!!busy} onClick={() => input.current?.click()}>
              <Upload size={16} /> Загрузить{folder ? ` в «${crumbs[crumbs.length - 1]}»` : ""}
            </button>
          </>
        )}
      </div>

      {busy && <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">Загружаю: {busy.done} из {busy.total}…</p>}
      {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}

      {!q && (
        <nav className="flex flex-wrap items-center gap-1 text-[15px]">
          <button type="button" onClick={() => { setFolder(""); setLimit(PAGE); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-primary-700 hover:bg-primary-50">
            <Home size={15} /> Все файлы
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <ChevronRight size={14} className="text-stone-400" />
              <button type="button" onClick={() => { setFolder(crumbs.slice(0, i + 1).join("/")); setLimit(PAGE); }} className="rounded-md px-2 py-1 font-semibold text-stone-700 hover:bg-stone-100">
                {c}
              </button>
            </span>
          ))}
          {canEdit && folder && (
            <span className="ml-auto inline-flex gap-1.5">
              <button type="button" className="inline-flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-[13px] font-semibold text-stone-700 hover:bg-stone-50" onClick={() => setVisible({ folder }, false)} title="Бригада не увидит файлы этой папки">
                <EyeOff size={14} /> Скрыть папку от бригады
              </button>
              <button type="button" className="inline-flex items-center gap-1 rounded-md border border-stone-300 px-2 py-1 text-[13px] font-semibold text-stone-700 hover:bg-stone-50" onClick={() => setVisible({ folder }, true)}>
                <Eye size={14} /> Показать
              </button>
            </span>
          )}
        </nav>
      )}

      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {view.folders.map((f) => (
          <button key={f.name} type="button" onClick={() => { setFolder(folder ? `${folder}/${f.name}` : f.name); setLimit(PAGE); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
            <Folder size={20} className="shrink-0 text-primary-500" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-stone-900">{f.name}</span>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm font-semibold text-stone-600">{f.count}</span>
            <ChevronRight size={16} className="text-stone-400" />
          </button>
        ))}
        {shown.map((f) => {
          const Icon = iconFor(f);
          return (
            <div key={f.id} className="group flex items-center gap-3 px-4 py-2.5">
              <Icon size={20} className="shrink-0 text-stone-500" />
              <span className="min-w-0 flex-1">
                <a href={`${api}?fileId=${f.id}`} className="block truncate text-[15px] font-medium text-stone-900 hover:text-primary-700" title={f.name}>
                  {f.name}
                </a>
                <span className="block truncate text-[13px] text-stone-500">
                  {q && f.folder ? `${f.folder} · ` : ""}
                  {dateText(f)}
                  {canEdit && f.team_visible === false && <span className="ml-2 rounded bg-warning-50 px-1.5 py-px text-xs font-semibold text-warning-800">скрыт от бригады</span>}
                </span>
              </span>
              <span className="shrink-0 text-sm text-stone-500">{sizeText(f.size_bytes)}</span>
              <a href={`${api}?fileId=${f.id}`} className="shrink-0 rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900" title="Скачать">
                <Download size={17} />
              </a>
              {canEdit && (
                <button type="button" className={`shrink-0 rounded-lg p-2 hover:bg-stone-100 ${f.team_visible === false ? "text-warning-700" : "text-stone-400 opacity-60 group-hover:opacity-100"}`} title={f.team_visible === false ? "Скрыт от бригады - нажмите, чтобы показать" : "Скрыть от бригады"} onClick={() => setVisible({ file: f }, f.team_visible === false)}>
                  {f.team_visible === false ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              )}
              {canEdit && (
                <button type="button" className="shrink-0 rounded-lg p-2 text-stone-400 opacity-60 hover:bg-stone-100 hover:text-error-600 group-hover:opacity-100" title="Удалить" onClick={() => remove(f)}>
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          );
        })}
        {view.folders.length === 0 && view.items.length === 0 && (
          <p className="px-4 py-8 text-center text-[15px] text-stone-600">
            {q ? "Ничего не найдено" : files.length === 0 ? (canEdit ? "Файлов пока нет. Перетащите их сюда или нажмите «Загрузить»." : "Файлов пока нет.") : "В этой папке пусто."}
          </p>
        )}
      </div>

      {view.items.length > shown.length && (
        <button type="button" className="btn w-full py-2 text-[15px]" onClick={() => setLimit((l) => l + PAGE)}>
          Показать ещё ({view.items.length - shown.length})
        </button>
      )}
    </div>
  );
}
