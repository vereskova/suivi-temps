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

/** Своя обложка папки: цвет из палитры, эмодзи и/или картинка (ссылка временная). */
export type FsCover = { color?: string | null; emoji?: string | null; url?: string | null };
export const FOLDER_COLORS: Record<string, [string, string]> = {
  blue: ["#4BA3F0", "#7CC4FF"],
  red: ["#E5534B", "#F4908A"],
  orange: ["#F08A24", "#FDB462"],
  yellow: ["#E8B923", "#FCD95B"],
  green: ["#3FAF6B", "#7DD6A0"],
  teal: ["#1FA8A0", "#6ED3CC"],
  purple: ["#8B63D6", "#B79BEB"],
  pink: ["#E0589C", "#F59CC6"],
  gray: ["#7C8794", "#B3BCC6"],
};
export type FsFolder = { name: string; count?: number; hidden?: boolean; cover?: FsCover | null };
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
