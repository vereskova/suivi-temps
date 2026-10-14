// Синхронизация сценария в базе при «Отменить / Вернуть»: приводит строки от состояния cur к target.
import type { OrgNode, OrgPlacement } from "./model";

export type ScenarioSnapshot = { nodes: OrgNode[]; placements: OrgPlacement[] };

/** Клиент Supabase (типизирован свободно, чтобы функцию можно было вызывать и из скрипта-теста). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { from: (table: string) => any };

/** Совпадают ли две строки (без служебных полей). */
export function sameRow(a: object, b: object): boolean {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  keys.delete("created_at");
  for (const k of keys) if (x[k] !== y[k] && !(x[k] == null && y[k] == null)) return false;
  return true;
}

/**
 * Порядок важен из-за внешних ключей и уникальных индексов:
 * 1) узлы (родители раньше детей), 2) лишние размещения, 3) лишние узлы, 4) размещения.
 */
export async function syncScenarioDb(db: DbClient, cur: ScenarioSnapshot, target: ScenarioSnapshot) {
  const curNodes = new Map(cur.nodes.map((n) => [n.id, n]));
  const tgtNodeIds = new Set(target.nodes.map((n) => n.id));
  const upsertNodes = target.nodes.filter((n) => {
    const c = curNodes.get(n.id);
    return !c || !sameRow(c, n);
  });
  const removedNodes = cur.nodes.filter((n) => !tgtNodeIds.has(n.id)).map((n) => n.id);
  const curPl = new Map(cur.placements.map((x) => [x.id, x]));
  const tgtPlIds = new Set(target.placements.map((x) => x.id));
  const removedPl = cur.placements.filter((x) => !tgtPlIds.has(x.id)).map((x) => x.id);
  const upsertPl = target.placements.filter((x) => {
    const c = curPl.get(x.id);
    return !c || !sameRow(c, x);
  });

  const exists = new Set(cur.nodes.map((n) => n.id));
  const done = new Set<string>();
  let rest = upsertNodes;
  while (rest.length) {
    const layer = rest.filter((n) => !n.parent_id || exists.has(n.parent_id) || done.has(n.parent_id));
    if (!layer.length) throw new Error("Цикл в структуре");
    const { error } = await db.from("org_nodes").upsert(layer, { onConflict: "id" });
    if (error) throw new Error(error.message);
    layer.forEach((n) => done.add(n.id));
    rest = rest.filter((n) => !done.has(n.id));
  }
  if (removedPl.length) {
    const { error } = await db.from("org_placements").delete().in("id", removedPl);
    if (error) throw new Error(error.message);
  }
  if (removedNodes.length) {
    const { error } = await db.from("org_nodes").delete().in("id", removedNodes);
    if (error) throw new Error(error.message);
  }
  if (upsertPl.length) {
    const { error } = await db.from("org_placements").upsert(upsertPl, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
}
