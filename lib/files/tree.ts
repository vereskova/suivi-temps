// Общее описание дерева папок (сервер и браузер): Корень -> KOMANDA_N -> статус -> объект -> вложенные папки -> файлы.
// Как в iCloud: у каждой команды своя папка, внутри - En cours / A venir / Pas fini / Fini, внутри - папки объектов.

export const STATUS_FOLDERS = [
  { key: "en_cours", label: "En cours" },
  { key: "a_venir", label: "A venir" },
  { key: "pas_fini", label: "Pas fini" },
  { key: "fini", label: "Fini" },
] as const;
export type StatusKey = (typeof STATUS_FOLDERS)[number]["key"];

export const statusLabel = (key: string) => STATUS_FOLDERS.find((s) => s.key === key)?.label ?? key;
export const statusKey = (label: string): StatusKey | null => STATUS_FOLDERS.find((s) => s.label === label)?.key ?? null;

/** « Equipe 7 » -> « KOMANDA_7 » (как папки команд в iCloud). */
export function teamFolderName(teamName: string): string {
  const n = teamName.replace(/\D+/g, "");
  return n ? `KOMANDA_${Number(n)}` : teamName;
}

export type FsFolder = { name: string; count?: number; hidden?: boolean };
export type FsFile = { id: string; name: string; size_bytes: number | null; mime: string | null; taken_at: string | null; created_at: string; team_visible?: boolean };
export type FsListing = {
  path: string[];
  /** 0 корень, 1 команда, 2 статус, 3+ внутри объекта */
  level: number;
  folders: FsFolder[];
  files: FsFile[];
  /** можно создавать папки / загружать здесь */
  canMkdir: boolean;
  canUploadFiles: boolean;
  canUploadFolders: boolean;
  /** офис: удалять, скрывать от бригады, переносить объекты */
  canManage: boolean;
};
