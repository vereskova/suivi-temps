"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, Eye, EyeOff, File as FileIcon, FileImage, FileSpreadsheet, FileText, Film, FolderPlus, FolderUp, Home, ImagePlus, LayoutGrid, List, Pencil, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FOLDER_COLORS, STATUS_FOLDERS, type FsFile, type FsFolder, type FsListing } from "@/lib/files/tree";

// Файлы как в iCloud / Finder: Корень -> KOMANDA_N -> статус -> объект -> папки -> файлы.
// Новая папка, загрузка папки (с вложенными), файлов и фото; перетаскивание из Finder. Права приходят из API.

const MAX_BYTES = 50 * 1024 * 1024;
const POOL = 3;
const JUNK = /^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.*)$/i;

type Item = { file: File; rel: string[] };
type Prog = { done: number; total: number; failed: string[] };

const sizeText = (n: number | null) => {
  if (n == null) return "";
  if (n < 1024) return `${n} Б`;
  if (n < 1048576) return `${Math.round(n / 1024)} КБ`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1).replace(".", ",")} МБ`;
  return `${(n / 1073741824).toFixed(1).replace(".", ",")} ГБ`;
};
const dateText = (f: FsFile) => {
  const iso = f.taken_at ?? f.created_at;
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "";
};
function iconFor(f: FsFile) {
  const n = f.name.toLowerCase();
  if (/\.(jpe?g|png|heic|heif|webp|gif)$/.test(n) || f.mime?.startsWith("image/")) return FileImage;
  if (/\.(mp4|mov|m4v|avi)$/.test(n) || f.mime?.startsWith("video/")) return Film;
  if (/\.(xlsx?|numbers|csv)$/.test(n)) return FileSpreadsheet;
  if (/\.(pdf|docx?|pages|txt)$/.test(n)) return FileText;
  return FileIcon;
}

function FolderGlyph({ size = 64, dim = false, cover }: { size?: number; dim?: boolean; cover?: FsFolder["cover"] }) {
  const [back, front] = FOLDER_COLORS[cover?.color ?? "blue"] ?? FOLDER_COLORS.blue;
  const h = (size * 52) / 64;
  if (cover?.url) {
    // Своя картинка вместо значка папки: скруглённая обложка с маленьким «ярлычком» папки
    return (
      <span className={`relative inline-block ${dim ? "opacity-50" : ""}`} style={{ width: size, height: h }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover.url} alt="" className="h-full w-full rounded-xl border-2 border-white object-cover shadow-sm ring-1 ring-stone-200" />
        <span className="absolute -bottom-1 -left-1 rounded-md bg-white p-0.5 shadow">
          <svg width={16} height={13} viewBox="0 0 64 52" aria-hidden>
            <path d="M4 10a6 6 0 0 1 6-6h14l6 6h24a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={back} />
            <path d="M4 18a6 6 0 0 1 6-6h44a6 6 0 0 1 6 6v24a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={front} />
          </svg>
        </span>
      </span>
    );
  }
  return (
    <span className={`relative inline-block ${dim ? "opacity-50" : ""}`} style={{ width: size, height: h }}>
      <svg width={size} height={h} viewBox="0 0 64 52" aria-hidden>
        <path d="M4 10a6 6 0 0 1 6-6h14l6 6h24a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={back} />
        <path d="M4 18a6 6 0 0 1 6-6h44a6 6 0 0 1 6 6v24a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={front} />
      </svg>
      {cover?.emoji && (
        <span className="absolute inset-x-0 flex items-center justify-center leading-none" style={{ top: h * 0.3, height: h * 0.6, fontSize: size * 0.36 }}>
          {cover.emoji}
        </span>
      )}
    </span>
  );
}

const EMOJIS = ["🏗️", "📷", "📄", "📐", "⚡", "🔧", "⚠️", "✅", "🧾", "📍", "🏠", "☀️"];

/** Окно « Настроить папку »: название, цвет, эмодзи, своя картинка-обложка. */
function FolderEditor({ folder, canRename, canCover, onClose, onSave }: { folder: FsFolder; canRename: boolean; canCover: boolean; onClose: () => void; onSave: (v: { name: string; color: string | null; emoji: string; image: File | null; removeImage: boolean }) => Promise<void> }) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string | null>(folder.cover?.color ?? null);
  const [emoji, setEmoji] = useState(folder.cover?.emoji ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : removeImage ? null : (folder.cover?.url ?? null)), [image, removeImage, folder.cover?.url]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-stone-900">Настроить папку</h3>
          <button type="button" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="mb-4 flex justify-center">
          <FolderGlyph size={96} cover={{ color, emoji: emoji || null, url: preview }} />
        </div>
        {canRename && (
          <label className="mb-3 block text-[13px] font-semibold text-stone-600">
            Название
            <input className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-[15px] font-normal text-stone-900 outline-none focus:border-primary-500" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {canCover && (
          <>
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-semibold text-stone-600">Цвет</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(FOLDER_COLORS).map(([k, [, front]]) => (
                  <button key={k} type="button" title={k} onClick={() => setColor(k === "blue" ? null : k)} className={`h-8 w-8 rounded-full border-2 ${(color ?? "blue") === k ? "border-stone-900" : "border-white ring-1 ring-stone-200"}`} style={{ background: front }} />
                ))}
              </div>
            </div>
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-semibold text-stone-600">Эмодзи на папке</p>
              <input className="mb-2 w-24 rounded-lg border border-stone-300 px-3 py-2 text-center text-xl outline-none focus:border-primary-500" maxLength={8} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🙂" />
              <div className="flex flex-wrap gap-1.5">
                {EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => setEmoji(e)} className="rounded-lg border border-stone-200 px-2 py-1 text-xl hover:bg-stone-50">
                    {e}
                  </button>
                ))}
                {emoji && (
                  <button type="button" onClick={() => setEmoji("")} className="rounded-lg px-2 py-1 text-[13px] font-semibold text-stone-500 hover:bg-stone-100">
                    убрать
                  </button>
                )}
              </div>
            </div>
            <div className="mb-4">
              <p className="mb-1.5 text-[13px] font-semibold text-stone-600">Своя картинка вместо значка</p>
              <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f) { setImage(f); setRemoveImage(false); } e.target.value = ""; }} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn gap-1.5 px-3 py-2 text-[14px]" onClick={() => imgRef.current?.click()}>
                  <ImagePlus size={15} /> {preview ? "Заменить картинку" : "Загрузить картинку"}
                </button>
                {preview && (
                  <button type="button" className="btn px-3 py-2 text-[14px]" onClick={() => { setImage(null); setRemoveImage(true); }}>
                    Убрать картинку
                  </button>
                )}
              </div>
              <p className="mt-1 text-[12px] text-stone-500">Лучше квадратная, до 5 МБ.</p>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn px-4 py-2 text-[15px]" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary px-4 py-2 text-[15px]"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({ name: name.trim(), color, emoji: emoji.trim(), image, removeImage });
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Перетаскивание из Finder: папки читаем рекурсивно ─────────────────────────────────────────
type FsEntry = { isFile: boolean; isDirectory: boolean; name: string; file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void; createReader?: () => { readEntries: (cb: (e: FsEntry[]) => void, err?: (e: unknown) => void) => void } };
async function readAll(reader: { readEntries: (cb: (e: FsEntry[]) => void, err?: (e: unknown) => void) => void }): Promise<FsEntry[]> {
  const out: FsEntry[] = [];
  for (;;) {
    const batch = await new Promise<FsEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) return out;
    out.push(...batch);
  }
}
async function walk(entry: FsEntry, rel: string[], items: Item[], dirs: string[][]) {
  if (entry.isFile && entry.file) {
    if (JUNK.test(entry.name)) return;
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej));
    items.push({ file, rel });
  } else if (entry.isDirectory && entry.createReader) {
    const here = [...rel, entry.name];
    dirs.push(here);
    for (const child of await readAll(entry.createReader())) await walk(child, here, items, dirs);
  }
}
async function collectDrop(dt: DataTransfer): Promise<{ items: Item[]; dirs: string[][] }> {
  const items: Item[] = [];
  const dirs: string[][] = [];
  const entries: FsEntry[] = [];
  for (const it of Array.from(dt.items ?? [])) {
    const e = (it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.();
    if (e) entries.push(e);
  }
  if (entries.length === 0) {
    Array.from(dt.files ?? []).forEach((file) => !JUNK.test(file.name) && items.push({ file, rel: [] }));
    return { items, dirs };
  }
  for (const e of entries) await walk(e, [], items, dirs);
  return { items, dirs };
}

export default function FileSystemBrowser({ api, rootLabel = "Папки" }: { api: string; rootLabel?: string }) {
  const [path, setPath] = useState<string[]>([]);
  const [data, setData] = useState<FsListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prog, setProg] = useState<Prog | null>(null);
  const [drag, setDrag] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [editing, setEditing] = useState<FsFolder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("fs-view");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v === "list" || v === "grid") setView(v);
    } catch {}
  }, []);
  const pickView = (v: "grid" | "list") => {
    setView(v);
    try {
      window.localStorage.setItem("fs-view", v);
    } catch {}
  };

  const reqId = useRef(0);
  const lastGood = useRef<string[]>([]);
  // Кэш просмотренных папок: повторное открытие и «назад» мгновенные, свежие данные подгружаются в фоне
  const cache = useRef(new Map<string, FsListing>());
  const inflight = useRef(new Set<string>());
  const [loading, setLoading] = useState(false);
  const load = useCallback(
    async (p: string[]) => {
      const key = p.join("/");
      const cached = cache.current.get(key);
      if (cached) {
        lastGood.current = cached.path;
        setData(cached);
        setError(null);
      }
      const id = ++reqId.current;
      setLoading(true);
      const res = await fetch(`${api}?path=${encodeURIComponent(key)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as FsListing & { error?: string };
      if (id !== reqId.current) return false; // пришёл устаревший ответ (быстрые клики) - игнорируем
      setLoading(false);
      if (!res.ok) {
        setError(json.error ?? "Ошибка загрузки");
        setPath(lastGood.current); // вернуться на последнюю открывшуюся папку
        return false;
      }
      cache.current.set(key, json);
      lastGood.current = json.path;
      setData(json);
      setError(null);
      return true;
    },
    [api]
  );
  /** Подгрузить содержимое папки заранее (при наведении), чтобы открытие было мгновенным. */
  const prefetch = useCallback(
    (p: string[]) => {
      const key = p.join("/");
      if (cache.current.has(key) || inflight.current.has(key)) return;
      inflight.current.add(key);
      fetch(`${api}?path=${encodeURIComponent(key)}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<FsListing>) : null))
        .then((j) => {
          if (j) cache.current.set(key, j);
        })
        .catch(() => {})
        .finally(() => inflight.current.delete(key));
    },
    [api]
  );
  /** После изменений (создали / удалили / загрузили) кэш сбрасывается. */
  const refresh = async (p: string[]) => {
    cache.current.clear();
    await load(p);
  };
  useEffect(() => {
    load(path);
  }, [load, path]);

  /** Путь той папки, которая сейчас на экране (а не той, что ещё загружается) - от неё строятся все действия. */
  const cur = data?.path ?? path;
  const open = (p: string[]) => {
    setNewName(null);
    setPath(p);
  };
  const post = async (body: Record<string, unknown>) => {
    const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Ошибка");
    return json;
  };

  // ── Загрузка ───────────────────────────────────────────────────────────────────────────────
  async function upload(base: string[], baseLevel: number, items: Item[], dirs: string[][]) {
    if (baseLevel < 2) return setError("Откройте папку статуса (En cours, A venir…) или папку объекта и загрузите туда");
    const supabase = createClient();
    const failed: string[] = [];
    const clean = items.filter((i) => !JUNK.test(i.file.name));
    const tasks: { file: File; target: string[] }[] = [];

    try {
      if (baseLevel === 2) {
        // В папку статуса кладут ПАПКИ объектов: первая папка = название объекта (создаётся, если её нет)
        const objects = new Set<string>();
        for (const it of clean) {
          if (it.rel.length === 0) failed.push(`«${it.file.name}»: положите файлы внутрь папки объекта`);
          else objects.add(it.rel[0]);
        }
        for (const d of dirs) if (d.length >= 1) objects.add(d[0]);
        for (const name of objects) await post({ action: "mkdir", path: base.join("/"), name, ifExists: "ok" });
        for (const it of clean) if (it.rel.length > 0) tasks.push({ file: it.file, target: [...base, ...it.rel] });
        const dirSet = new Set(dirs.filter((d) => d.length > 1).map((d) => [...base, ...d].join("\u0000")));
        for (const d of dirSet) {
          const segs = d.split("\u0000");
          await post({ action: "mkdir", path: segs.slice(0, -1).join("/"), name: segs[segs.length - 1] });
        }
      } else {
        for (const it of clean) tasks.push({ file: it.file, target: [...base, ...it.rel] });
        const dirSet = new Set(dirs.map((d) => [...base, ...d].join("\u0000")));
        for (const d of dirSet) {
          const segs = d.split("\u0000");
          await post({ action: "mkdir", path: segs.slice(0, -1).join("/"), name: segs[segs.length - 1] });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      return;
    }

    setProg({ done: 0, total: tasks.length, failed });
    let done = 0;
    let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= tasks.length) return;
        const { file, target } = tasks[i];
        try {
          if (file.size > MAX_BYTES) throw new Error("больше 50 МБ");
          const p = target.join("/");
          const sign = (await post({ action: "sign", path: p, name: file.name, size: file.size, mime: file.type })) as { path?: string; token?: string };
          if (!sign.path || !sign.token) throw new Error("не удалось начать загрузку");
          const up = await supabase.storage.from("object-files").uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type || undefined });
          if (up.error) throw new Error(up.error.message);
          await post({ action: "register", path: p, storage_path: sign.path, name: file.name, size: file.size, mime: file.type });
        } catch (e) {
          failed.push(`«${file.name}»: ${e instanceof Error ? e.message : "ошибка"}`);
        }
        done++;
        setProg({ done, total: tasks.length, failed: [...failed] });
      }
    };
    await Promise.all(Array.from({ length: Math.min(POOL, Math.max(1, tasks.length)) }, worker));
    setProg(null);
    setError(failed.length ? `Не загружено ${failed.length}: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "…" : ""}` : null);
    await refresh(cur);
  }

  const fromInput = (list: FileList | null, here: string[], level: number, withDirs: boolean) => {
    const arr = Array.from(list ?? []);
    const items: Item[] = arr.map((file) => {
      const rp = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const parts = withDirs && rp ? rp.split("/").slice(0, -1) : [];
      return { file, rel: parts };
    });
    upload(here, level, items, []);
  };

  async function onDrop(e: React.DragEvent, here: string[], level: number) {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
    setDropTarget(null);
    if (!data) return;
    const { items, dirs } = await collectDrop(e.dataTransfer);
    upload(here, level, items, dirs);
  }

  // ── Действия ───────────────────────────────────────────────────────────────────────────────
  async function createFolder() {
    const name = (newName ?? "").trim();
    if (!name) return setNewName(null);
    try {
      await post({ action: "mkdir", path: cur.join("/"), name });
      setNewName(null);
      await refresh(cur);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  }
  async function removeFolder(f: FsFolder) {
    const target = [...cur, f.name];
    const isObject = target.length === 3;
    const msg = isObject ? `Удалить объект «${f.name}» со всеми файлами, сметой и контрандю? Это нельзя отменить.` : `Удалить папку «${f.name}» со всем содержимым? Это нельзя отменить.`;
    if (!window.confirm(msg)) return;
    const res = await fetch(`${api}?path=${encodeURIComponent(target.join("/"))}`, { method: "DELETE" });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось удалить");
    await refresh(cur);
  }
  async function removeFile(f: FsFile) {
    if (!window.confirm(`Удалить файл «${f.name}»?`)) return;
    const res = await fetch(`${api}?fileId=${f.id}`, { method: "DELETE" });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось удалить");
    await refresh(cur);
  }
  async function setVisible(target: string[], visible: boolean, fileId?: string) {
    const res = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: target.join("/"), visible, file_id: fileId }) });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Не удалось изменить");
    await refresh(cur);
  }
  async function saveFolder(f: FsFolder, v: { name: string; color: string | null; emoji: string; image: File | null; removeImage: boolean }) {
    const target = [...cur, f.name];
    try {
      let finalTarget = target;
      if (cur.length >= 2 && v.name !== f.name) {
        await post({ action: "rename", path: target.join("/"), name: v.name });
        finalTarget = [...cur, v.name];
      }
      let image_path: string | undefined;
      if (v.image) {
        const sign = (await post({ action: "cover_sign", path: finalTarget.join("/"), name: v.image.name, size: v.image.size })) as { path?: string; token?: string };
        if (!sign.path || !sign.token) throw new Error("не удалось начать загрузку картинки");
        const up = await createClient().storage.from("object-files").uploadToSignedUrl(sign.path, sign.token, v.image, { contentType: v.image.type || undefined });
        if (up.error) throw new Error(up.error.message);
        image_path = sign.path;
      }
      await post({ action: "cover_set", path: finalTarget.join("/"), color: v.color, emoji: v.emoji || null, image_path, keep_image: v.removeImage ? false : true });
      setEditing(null);
      await refresh(cur);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setEditing(null);
    }
  }
  async function renameFile(f: FsFile) {
    const name = window.prompt("Новое имя файла", f.name)?.trim();
    if (!name || name === f.name) return;
    try {
      await post({ action: "rename_file", path: cur.join("/"), file_id: f.id, name });
      await refresh(cur);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  }
  async function moveObject(toKey: string) {
    try {
      await post({ action: "move", path: cur.slice(0, 3).join("/"), to_status: toKey });
      const label = STATUS_FOLDERS.find((s) => s.label === cur[1] || s.key === toKey)?.label ?? cur[1];
      setPath([cur[0], STATUS_FOLDERS.find((s) => s.key === toKey)?.label ?? label, ...cur.slice(2)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  }

  const level = data?.level ?? path.length;
  const folders = data?.folders ?? [];
  const files = data?.files ?? [];
  const canUpload = !!data && (data.canUploadFiles || data.canUploadFolders);
  const curStatusKey = useMemo(() => STATUS_FOLDERS.find((s) => s.label === cur[1])?.key ?? "", [cur]);
  const empty = folders.length === 0 && files.length === 0;

  return (
    <div
      className={`space-y-3 rounded-2xl ${drag ? "ring-2 ring-primary-400" : ""}`}
      onDragOver={(e) => {
        if (!data?.canUploadFiles && !data?.canUploadFolders) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        if (!data || !canUpload) return;
        onDrop(e, cur, level);
      }}
    >
      {/* Хлебные крошки + режим просмотра */}
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[15px]">
          <button type="button" onClick={() => open([])} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-primary-700 hover:bg-primary-50">
            <Home size={15} /> {rootLabel}
          </button>
          {cur.map((c, i) => (
            <span key={i} className="inline-flex min-w-0 items-center gap-1">
              <ChevronRight size={14} className="shrink-0 text-stone-400" />
              <button type="button" onClick={() => open(cur.slice(0, i + 1))} className={`truncate rounded-md px-2 py-1 font-semibold hover:bg-stone-100 ${i === cur.length - 1 ? "text-stone-900" : "text-stone-600"}`}>
                {c}
              </button>
            </span>
          ))}
        </nav>
        <div className="inline-flex overflow-hidden rounded-lg border border-stone-300 bg-white">
          <button type="button" className={`p-2 ${view === "grid" ? "bg-stone-100 text-stone-900" : "text-stone-500"}`} title="Значки" onClick={() => pickView("grid")}>
            <LayoutGrid size={16} />
          </button>
          <button type="button" className={`p-2 ${view === "list" ? "bg-stone-100 text-stone-900" : "text-stone-500"}`} title="Список" onClick={() => pickView("list")}>
            <List size={16} />
          </button>
        </div>
      </div>

      <div className={`h-0.5 overflow-hidden rounded-full ${loading ? "bg-primary-100" : "bg-transparent"}`}>{loading && <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-500" />}</div>

      {/* Действия */}
      {data && (data.canMkdir || canUpload || (data.canManage && level === 3)) && (
        <div className="flex flex-wrap items-center gap-2">
          {data.canMkdir && (
            <button type="button" className="btn gap-1.5 px-3 py-2 text-[15px]" onClick={() => setNewName("")}>
              <FolderPlus size={16} /> {level === 2 ? "Новый объект" : "Новая папка"}
            </button>
          )}
          {data.canUploadFolders && (
            <>
              <input ref={dirInput} type="file" multiple className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { fromInput(e.target.files, cur, level, true); e.target.value = ""; }} />
              <button type="button" className="btn gap-1.5 px-3 py-2 text-[15px]" disabled={!!prog} onClick={() => dirInput.current?.click()}>
                <FolderUp size={16} /> Загрузить папку
              </button>
            </>
          )}
          {data.canUploadFiles && (
            <>
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { fromInput(e.target.files, cur, level, false); e.target.value = ""; }} />
              <input ref={photoInput} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => { fromInput(e.target.files, cur, level, false); e.target.value = ""; }} />
              <button type="button" className="btn btn-primary gap-1.5 px-3 py-2 text-[15px]" disabled={!!prog} onClick={() => fileInput.current?.click()}>
                <Upload size={16} /> Загрузить файлы
              </button>
              <button type="button" className="btn gap-1.5 px-3 py-2 text-[15px]" disabled={!!prog} onClick={() => photoInput.current?.click()}>
                <ImagePlus size={16} /> Фото
              </button>
            </>
          )}
          {data.canManage && level === 3 && (
            <label className="ml-auto inline-flex items-center gap-2 text-[14px] text-stone-600">
              Папка статуса
              <select className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[14px] font-semibold text-stone-800" value={curStatusKey} onChange={(e) => moveObject(e.target.value)}>
                {STATUS_FOLDERS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {newName !== null && (
        <form
          className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            createFolder();
          }}
        >
          <FolderGlyph size={30} />
          <input autoFocus className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-[15px] outline-none focus:border-primary-500" placeholder={level === 2 ? "Название объекта" : "Название папки"} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="btn btn-primary px-3 py-2 text-[15px]">
            Создать
          </button>
          <button type="button" className="btn px-3 py-2 text-[15px]" onClick={() => setNewName(null)}>
            Отмена
          </button>
        </form>
      )}

      {prog && (
        <div className="rounded-lg bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">
          Загружаю: {prog.done} из {prog.total}…
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-100">
            <div className="h-full bg-primary-500 transition-all" style={{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}

      {!data && !error && <p className="text-stone-500">Загрузка…</p>}

      {data && (
        <div className={`rounded-2xl border border-stone-200 bg-white ${view === "grid" ? "p-3" : "divide-y divide-stone-100 overflow-hidden"}`}>
          {view === "grid" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {folders.map((f) => {
                const target = [...cur, f.name];
                return (
                  <div
                    key={`d-${f.name}`}
                    onMouseEnter={() => prefetch(target)}
                    onTouchStart={() => prefetch(target)}
                    className={`group relative flex flex-col items-center gap-1 rounded-xl p-2 text-center hover:bg-stone-50 ${dropTarget === f.name ? "bg-primary-50 ring-2 ring-primary-300" : ""}`}
                    onDragOver={(e) => {
                      if (level < 1 || (level === 1 && !data.canManage) || level === 1) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTarget(f.name);
                    }}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => {
                      if (level < 2) return;
                      onDrop(e, target, level + 1);
                    }}
                  >
                    <button type="button" className="flex w-full flex-col items-center gap-1" onClick={() => open(target)} title={f.name}>
                      <FolderGlyph size={72} dim={f.hidden} cover={f.cover} />
                      <span className="line-clamp-2 w-full break-words text-[14px] font-semibold leading-tight text-stone-900">{f.name}</span>
                      {f.count !== undefined && <span className="text-[12px] text-stone-500">{f.count}</span>}
                    </button>
                    {data.canManage && level >= 3 && (
                      <button type="button" className="absolute left-1 top-1 rounded-md bg-white/90 p-1 text-stone-500 opacity-0 shadow-sm hover:text-stone-900 group-hover:opacity-100" title={f.hidden ? "Скрыта от бригады - показать" : "Скрыть от бригады"} onClick={() => setVisible(target, !!f.hidden)}>
                        {f.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                    {data.canManage && (
                      <button type="button" className={`absolute top-1 rounded-md bg-white/90 p-1 text-stone-500 opacity-0 shadow-sm hover:text-stone-900 group-hover:opacity-100 ${level >= 2 ? "right-8" : "right-1"}`} title="Название и обложка" onClick={() => setEditing(f)}>
                        <Pencil size={14} />
                      </button>
                    )}
                    {data.canManage && level >= 2 && (
                      <button type="button" className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-stone-400 opacity-0 shadow-sm hover:text-error-600 group-hover:opacity-100" title="Удалить" onClick={() => removeFolder(f)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              {files.map((f) => {
                const Icon = iconFor(f);
                return (
                  <div key={f.id} className="group relative flex flex-col items-center gap-1 rounded-xl p-2 text-center hover:bg-stone-50">
                    <a href={`${api}?fileId=${f.id}`} className="flex w-full flex-col items-center gap-1" title={f.name}>
                      <span className="flex h-[58px] w-[72px] items-center justify-center rounded-lg bg-stone-100">
                        <Icon size={32} className="text-stone-500" />
                      </span>
                      <span className="line-clamp-2 w-full break-all text-[13px] font-medium leading-tight text-stone-900">{f.name}</span>
                      <span className="text-[12px] text-stone-500">
                        {sizeText(f.size_bytes)}
                        {f.team_visible === false && data.canManage && " · скрыт"}
                      </span>
                    </a>
                    {data.canManage && (
                      <>
                        <button type="button" className="absolute left-1 top-1 rounded-md bg-white/90 p-1 text-stone-500 opacity-0 shadow-sm hover:text-stone-900 group-hover:opacity-100" title={f.team_visible === false ? "Показать бригаде" : "Скрыть от бригады"} onClick={() => setVisible(cur, f.team_visible === false, f.id)}>
                          {f.team_visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button type="button" className="absolute right-8 top-1 rounded-md bg-white/90 p-1 text-stone-500 opacity-0 shadow-sm hover:text-stone-900 group-hover:opacity-100" title="Переименовать" onClick={() => renameFile(f)}>
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-stone-400 opacity-0 shadow-sm hover:text-error-600 group-hover:opacity-100" title="Удалить" onClick={() => removeFile(f)}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {folders.map((f) => (
                <div key={`d-${f.name}`} className="group flex items-center gap-3 px-3 py-2 hover:bg-stone-50">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onMouseEnter={() => prefetch([...cur, f.name])} onClick={() => open([...cur, f.name])}>
                    <FolderGlyph size={30} dim={f.hidden} cover={f.cover} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-stone-900">{f.name}</span>
                    {f.count !== undefined && <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm font-semibold text-stone-600">{f.count}</span>}
                    <ChevronRight size={16} className="text-stone-400" />
                  </button>
                  {data.canManage && level >= 3 && (
                    <button type="button" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100" title={f.hidden ? "Скрыта от бригады - показать" : "Скрыть от бригады"} onClick={() => setVisible([...cur, f.name], !!f.hidden)}>
                      {f.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                  {data.canManage && (
                    <button type="button" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100" title="Название и обложка" onClick={() => setEditing(f)}>
                      <Pencil size={16} />
                    </button>
                  )}
                  {data.canManage && level >= 2 && (
                    <button type="button" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-error-600" title="Удалить" onClick={() => removeFolder(f)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {files.map((f) => {
                const Icon = iconFor(f);
                return (
                  <div key={f.id} className="group flex items-center gap-3 px-3 py-2">
                    <Icon size={22} className="shrink-0 text-stone-500" />
                    <span className="min-w-0 flex-1">
                      <a href={`${api}?fileId=${f.id}`} className="block truncate text-[15px] font-medium text-stone-900 hover:text-primary-700" title={f.name}>
                        {f.name}
                      </a>
                      <span className="block truncate text-[13px] text-stone-500">
                        {dateText(f)}
                        {f.team_visible === false && data.canManage && <span className="ml-2 rounded bg-warning-50 px-1.5 py-px text-xs font-semibold text-warning-800">скрыт от бригады</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-stone-500">{sizeText(f.size_bytes)}</span>
                    <a href={`${api}?fileId=${f.id}`} className="shrink-0 rounded-lg p-2 text-stone-500 hover:bg-stone-100" title="Скачать">
                      <Download size={17} />
                    </a>
                    {data.canManage && (
                      <>
                        <button type="button" className="shrink-0 rounded-lg p-2 text-stone-400 hover:bg-stone-100" title={f.team_visible === false ? "Показать бригаде" : "Скрыть от бригады"} onClick={() => setVisible(cur, f.team_visible === false, f.id)}>
                          {f.team_visible === false ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                        <button type="button" className="shrink-0 rounded-lg p-2 text-stone-400 hover:bg-stone-100" title="Переименовать" onClick={() => renameFile(f)}>
                          <Pencil size={17} />
                        </button>
                        <button type="button" className="shrink-0 rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-error-600" title="Удалить" onClick={() => removeFile(f)}>
                          <Trash2 size={17} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
          {empty && (
            <p className="px-4 py-10 text-center text-[15px] text-stone-600">
              {level === 0
                ? "Нет доступных папок."
                : data.canMkdir || canUpload
                  ? level === 2
                    ? "Здесь пока нет объектов. Создайте объект или перетащите сюда папку объекта."
                    : "Папка пуста. Перетащите сюда файлы или папки, либо нажмите «Загрузить»."
                  : "Папка пуста."}
            </p>
          )}
        </div>
      )}
      {editing && data && (
        <FolderEditor
          key={editing.name}
          folder={editing}
          canRename={data.canManage && level >= 2}
          canCover={data.canManage}
          onClose={() => setEditing(null)}
          onSave={(v) => saveFolder(editing, v)}
        />
      )}
    </div>
  );
}
