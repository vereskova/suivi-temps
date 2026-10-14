"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncScenarioDb } from "@/lib/org/sync";
import { toast } from "@/components/Toast";
import {
  BUREAU_ROLE_ORDER,
  cloneScenarioRows,
  compareNodes,
  descendantIds,
  flatTemplate,
  orderedBureauRoles,
  planDiff,
  realityNodeFor,
  resolvePeople,
  seedsToNodes,
  visotskyTemplate,
  type OrgCandidateLite,
  type OrgNode,
  type OrgNodeKind,
  type OrgPerson,
  type OrgPlacement,
  type OrgScenario,
  type OrgScenarioStatus,
  type OrgTeamLite,
} from "@/lib/org/model";

type Supabase = ReturnType<typeof createClient>;

export type OrgMode = "now" | "plan";

function usePersisted<T extends string>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      return (window.localStorage.getItem(key) as T | null) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, v);
      } catch {
        /* localStorage недоступен — не критично */
      }
    },
    [key]
  );
  return [value, set];
}

const PERSON_COLUMNS =
  "id, first_name, last_name, category, bureau_role, team_id, secondary_team_id, org_sort_order, badge_emoji, can_substitute, hire_date, status";

type Snapshot = { nodes: OrgNode[]; placements: OrgPlacement[] };
const HISTORY_LIMIT = 50;

/** Кто сейчас что делает: id узла (куда смотрит/что правит) и подпись для чипа. */
export type OrgFocus = { id: string | null; label: string };
export type OrgPeer = { email: string; focus: OrgFocus | null; tab: string | null };

export type StartFrom = { type: "flat" } | { type: "visotsky" } | { type: "copy"; scenarioId: string };

/**
 * Общее ядро двух вкладок («Оргструктура» и «Схема компании»): реальные данные,
 * список сценариев, выбранный сценарий (узлы + размещения) и все правки.
 * В режиме «План» ничего не пишется в employees/teams — только в org_*.
 */
export function useOrgPlan(supabase: Supabase, canPlan: boolean, tabName: "organigramme" | "schema" = "organigramme") {
  const [people, setPeople] = useState<OrgPerson[]>([]);
  const [teams, setTeams] = useState<OrgTeamLite[]>([]);
  const [bureauSaved, setBureauSaved] = useState<Record<string, number>>({});
  const [candidates, setCandidates] = useState<OrgCandidateLite[]>([]);
  const [scenarios, setScenarios] = useState<OrgScenario[]>([]);
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);
  const [baseLoading, setBaseLoading] = useState(true);

  const [storedMode, setMode] = usePersisted<OrgMode>("org_mode", "now");
  const [storedScenarioId, setStoredScenarioId] = usePersisted<string>("org_scenario_id", "");

  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [placements, setPlacements] = useState<OrgPlacement[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentTick, setContentTick] = useState(0);
  const contentKey = useRef<string>("");
  // История для «Отменить / Вернуть» (только в памяти, на время работы с открытым сценарием).
  const [history, setHistory] = useState<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const batching = useRef(false);
  // Совместная работа: свои записи (чтобы не принять их эхо за чужие правки) и присутствие.
  const ownWrites = useRef(new Map<string, number>());
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [peers, setPeers] = useState<OrgPeer[]>([]);
  const presenceRef = useRef<ReturnType<Supabase["channel"]> | null>(null);
  const focusRef = useRef<OrgFocus | null>(null);

  /** Запомнить, что эти строки изменены нами (эхо Realtime в ближайшие секунды игнорируем). */
  function touch(table: "n" | "p", ids: string[]) {
    const until = Date.now() + 6000;
    ids.forEach((id) => ownWrites.current.set(`${table}:${id}`, until));
  }

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setMyEmail(data.user?.email ?? null);
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  // ── Базовые данные ──
  const loadBase = useCallback(async () => {
    const [empRes, teamRes, candRes, scRes, orderRes] = await Promise.all([
      supabase.from("employees").select(PERSON_COLUMNS).eq("status", "active"),
      supabase.from("teams").select("id, name, chef_employee_id").eq("active", true).order("name"),
      supabase
        .from("org_candidates")
        .select("id, full_name, position_label, category, team_id, team_label, status, arrival_date")
        .order("created_at"),
      supabase.from("org_scenarios").select("*").order("created_at", { ascending: false }),
      supabase.from("org_bureau_order").select("role, sort_order"),
    ]);
    const orderMap: Record<string, number> = {};
    (orderRes.data ?? []).forEach((r: { role: string; sort_order: number }) => (orderMap[r.role] = r.sort_order));
    setBureauSaved(orderMap);
    setPeople((empRes.data as unknown as OrgPerson[]) ?? []);
    setTeams((teamRes.data as OrgTeamLite[]) ?? []);
    setCandidates((candRes.data as unknown as OrgCandidateLite[]) ?? []);
    if (scRes.error) {
      setSchemaReady(false);
      setScenarios([]);
    } else {
      setSchemaReady(true);
      setScenarios((scRes.data as OrgScenario[]) ?? []);
    }
    setBaseLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBase();
  }, [loadBase]);

  const published = useMemo(() => scenarios.find((s) => s.status === "published") ?? null, [scenarios]);

  // Не-редакторы видят только опубликованный сценарий (RLS), поэтому «План» для них = он.
  const mode: OrgMode = canPlan ? storedMode : published ? storedMode : "now";
  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.id === storedScenarioId) ?? null,
    [scenarios, storedScenarioId]
  );
  /** План без выбранного сценария = быстрая прикидка в браузере (ничего не сохраняется). */
  const isLocal = canPlan && mode === "plan" && !selectedScenario;
  /** Какой сценарий реально отображается: в «Плане» выбранный, в «Сейчас» опубликованный (для схемы). */
  const activeScenario: OrgScenario | null =
    mode === "plan" ? (canPlan ? selectedScenario : published) : published;
  const canEdit = canPlan && mode === "plan" && (isLocal || selectedScenario?.status === "draft");

  const activeId = activeScenario?.id ?? "";

  // ── Содержимое активного сценария ──
  useEffect(() => {
    if (baseLoading) return;
    const key = isLocal ? `local:${teams.length}` : activeId;
    if (contentKey.current === key) return;
    contentKey.current = key;
    let cancelled = false;
    async function load() {
      setHistory({ past: [], future: [] });
      if (isLocal) {
        setNodes(seedsToNodes("local", flatTemplate(teams, orderedBureauRoles(bureauSaved))));
        setPlacements([]);
        return;
      }
      if (!activeId) {
        setNodes([]);
        setPlacements([]);
        return;
      }
      setContentLoading(true);
      const [{ data: n }, { data: p }] = await Promise.all([
        supabase.from("org_nodes").select("*").eq("scenario_id", activeId),
        supabase.from("org_placements").select("*").eq("scenario_id", activeId),
      ]);
      if (cancelled) return;
      const pl = (p as OrgPlacement[]) ?? [];
      setNodes((n as OrgNode[]) ?? []);
      setPlacements(pl);
      // Сотрудники из размещений, которых нет среди активных (уволены) — подгрузим для предупреждения.
      const have = new Set(people.map((x) => x.id));
      const missing = pl.map((x) => x.employee_id).filter((id): id is string => !!id && !have.has(id));
      if (missing.length) {
        const { data: extra } = await supabase.from("employees").select(PERSON_COLUMNS).in("id", missing);
        if (!cancelled && extra) setPeople((prev) => [...prev, ...((extra as unknown as OrgPerson[]) ?? [])]);
      }
      setContentLoading(false);
    }
    load();
    return () => {
      cancelled = true;
      // Если эффект перезапущен до завершения — разрешаем повторную загрузку.
      if (contentKey.current === key) contentKey.current = "";
    };
    // people намеренно не в зависимостях: он нужен только для разовой догрузки уволенных.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLoading, isLocal, activeId, teams, bureauSaved, supabase, contentTick]);

  // ── Правки других пользователей — в реальном времени ──
  useEffect(() => {
    if (!activeId || isLocal || schemaReady !== true) return;
    type Payload = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown>; old: Record<string, unknown> };
    function isOwn(table: "n" | "p", id: string) {
      const until = ownWrites.current.get(`${table}:${id}`);
      return !!until && until > Date.now();
    }
    function onRows(table: "n" | "p", payload: Payload) {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: string };
      if (!row?.id || isOwn(table, row.id)) return;
      const id = row.id;
      const apply = <T extends { id: string }>(prev: T[]): T[] => {
        if (payload.eventType === "DELETE") return prev.filter((x) => x.id !== id);
        const incoming = payload.new as unknown as T;
        const i = prev.findIndex((x) => x.id === id);
        if (i < 0) return [...prev, incoming];
        const copy = [...prev];
        copy[i] = incoming;
        return copy;
      };
      if (table === "n") setNodes((prev) => apply(prev));
      else setPlacements((prev) => apply(prev));
      // Состояние изменил кто-то другой: прежние шаги «Отменить» уже не соответствуют базе.
      setHistory({ past: [], future: [] });
    }
    let timer: number | undefined;
    const channel = supabase
      .channel(`org-db-${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "org_nodes", filter: `scenario_id=eq.${activeId}` }, (pl) =>
        onRows("n", pl as unknown as Payload)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "org_placements", filter: `scenario_id=eq.${activeId}` }, (pl) =>
        onRows("p", pl as unknown as Payload)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "org_scenarios" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(async () => {
          const { data, error } = await supabase.from("org_scenarios").select("*").order("created_at", { ascending: false });
          if (!error) setScenarios((data as OrgScenario[]) ?? []);
        }, 300);
      })
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, activeId, isLocal, schemaReady]);

  // ── Кто сейчас в этом сценарии и что делает ──
  useEffect(() => {
    if (!myEmail || !activeId || isLocal || schemaReady !== true) return;
    const channel = supabase.channel(`org-presence-${activeId}`, { config: { presence: { key: myEmail } } });
    presenceRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, { focus?: OrgFocus | null; tab?: string | null }[]>;
        setPeers(Object.entries(state).map(([email, metas]) => ({ email, focus: metas[0]?.focus ?? null, tab: metas[0]?.tab ?? null })));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ focus: focusRef.current, tab: tabName });
      });
    return () => {
      presenceRef.current = null;
      void supabase.removeChannel(channel);
      setPeers([]);
    };
  }, [supabase, myEmail, activeId, isLocal, schemaReady, tabName]);

  /** Сообщить остальным, что я сейчас делаю (null = ничего). */
  const setFocus = useCallback(
    (focus: OrgFocus | null) => {
      focusRef.current = focus;
      void presenceRef.current?.track({ focus, tab: tabName });
    },
    [tabName]
  );

  const reloadContent = useCallback(() => {
    contentKey.current = "";
    setContentTick((t) => t + 1);
  }, []);

  // ── Производные ──
  const resolved = useMemo(
    () => resolvePeople({ nodes, placements, employees: people, candidates, useOverrides: mode === "plan" }),
    [nodes, placements, people, candidates, mode]
  );
  const diff = useMemo(
    () => (mode === "plan" ? planDiff({ nodes, placements, employees: people, candidates }) : []),
    [mode, nodes, placements, people, candidates]
  );

  // ── Выбор ──
  const chooseMode = useCallback(
    (m: OrgMode) => {
      setMode(m);
    },
    [setMode]
  );
  const chooseScenario = useCallback(
    (id: string | null) => {
      setStoredScenarioId(id ?? "");
    },
    [setStoredScenarioId]
  );

  // ── Сценарии ──
  async function refreshScenarios() {
    const { data, error } = await supabase.from("org_scenarios").select("*").order("created_at", { ascending: false });
    if (!error) setScenarios((data as OrgScenario[]) ?? []);
  }

  async function userEmail(): Promise<string | null> {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  }

  async function insertContent(scenarioId: string, newNodes: OrgNode[], newPlacements: OrgPlacement[]) {
    if (newNodes.length) {
      // Родители раньше детей: вставляем по уровням, чтобы внешние ключи не ругались.
      const done = new Set<string>();
      let rest = [...newNodes];
      while (rest.length) {
        const batch = rest.filter((n) => !n.parent_id || done.has(n.parent_id));
        if (!batch.length) throw new Error("Цикл в структуре");
        const { error } = await supabase.from("org_nodes").insert(batch);
        if (error) throw new Error(error.message);
        batch.forEach((n) => done.add(n.id));
        rest = rest.filter((n) => !done.has(n.id));
      }
    }
    if (newPlacements.length) {
      const { error } = await supabase.from("org_placements").insert(newPlacements.map((p) => ({ ...p, scenario_id: scenarioId })));
      if (error) throw new Error(error.message);
    }
  }

  async function createScenario(title: string, from: StartFrom): Promise<string | null> {
    const email = await userEmail();
    const { data: sc, error } = await supabase
      .from("org_scenarios")
      .insert({ title: title.trim() || "Новый сценарий", created_by_email: email })
      .select("*")
      .single();
    if (error || !sc) {
      toast.error("Ошибка: " + (error?.message ?? "не удалось создать"));
      return null;
    }
    try {
      let newNodes: OrgNode[] = [];
      let newPlacements: OrgPlacement[] = [];
      if (from.type === "flat") newNodes = seedsToNodes(sc.id, flatTemplate(teams, orderedBureauRoles(bureauSaved)));
      else if (from.type === "visotsky") newNodes = seedsToNodes(sc.id, visotskyTemplate(teams));
      else {
        const [{ data: n }, { data: p }] = await Promise.all([
          supabase.from("org_nodes").select("*").eq("scenario_id", from.scenarioId),
          supabase.from("org_placements").select("*").eq("scenario_id", from.scenarioId),
        ]);
        const cloned = cloneScenarioRows(sc.id, (n as OrgNode[]) ?? [], (p as OrgPlacement[]) ?? []);
        newNodes = cloned.nodes;
        newPlacements = cloned.placements;
      }
      await insertContent(sc.id, newNodes, newPlacements);
    } catch (e) {
      await supabase.from("org_scenarios").delete().eq("id", sc.id);
      toast.error("Ошибка: " + (e as Error).message);
      return null;
    }
    await refreshScenarios();
    contentKey.current = "";
    setMode("plan");
    setStoredScenarioId(sc.id);
    toast.success("Сценарий создан");
    return sc.id;
  }

  /** Быстрая прикидка (в браузере) → сохранённый сценарий. */
  async function saveLocalAsScenario(title: string): Promise<string | null> {
    const email = await userEmail();
    const { data: sc, error } = await supabase
      .from("org_scenarios")
      .insert({ title: title.trim() || "Сценарий", created_by_email: email })
      .select("*")
      .single();
    if (error || !sc) {
      toast.error("Ошибка: " + (error?.message ?? "не удалось сохранить"));
      return null;
    }
    try {
      const cloned = cloneScenarioRows(sc.id, nodes, placements);
      await insertContent(sc.id, cloned.nodes, cloned.placements);
    } catch (e) {
      await supabase.from("org_scenarios").delete().eq("id", sc.id);
      toast.error("Ошибка: " + (e as Error).message);
      return null;
    }
    await refreshScenarios();
    contentKey.current = "";
    setStoredScenarioId(sc.id);
    toast.success("Сценарий сохранён");
    return sc.id;
  }

  async function setStatus(id: string, status: OrgScenarioStatus) {
    const { error } = await supabase.rpc("org_scenario_set_status", { p_id: id, p_status: status });
    if (error) {
      toast.error("Ошибка: " + error.message);
      return false;
    }
    await refreshScenarios();
    return true;
  }

  async function renameScenario(id: string, title: string) {
    const { error } = await supabase.from("org_scenarios").update({ title }).eq("id", id);
    if (error) toast.error("Ошибка: " + error.message);
    else await refreshScenarios();
  }

  async function deleteScenario(id: string) {
    const { error } = await supabase.from("org_scenarios").delete().eq("id", id);
    if (error) {
      toast.error("Ошибка: " + error.message);
      return;
    }
    if (storedScenarioId === id) setStoredScenarioId("");
    await refreshScenarios();
  }

  function resetLocal() {
    recordHistory();
    setNodes(seedsToNodes("local", flatTemplate(teams, orderedBureauRoles(bureauSaved))));
    setPlacements([]);
  }

  // ── Размещения (вся расстановка «что если») ──
  const scenarioIdForRows = isLocal ? "local" : activeId;

  /** Запоминает текущее состояние перед правкой (внутри batch — только один раз). */
  function recordHistory() {
    if (batching.current) return;
    const snap: Snapshot = { nodes, placements };
    setHistory((h) => ({ past: [...h.past, snap].slice(-HISTORY_LIMIT), future: [] }));
  }

  /** Несколько правок подряд = один шаг истории. */
  async function batch(fn: () => Promise<void>) {
    recordHistory();
    batching.current = true;
    try {
      await fn();
    } finally {
      batching.current = false;
    }
  }

  async function applySnapshot(target: Snapshot) {
    const cur: Snapshot = { nodes, placements };
    touch("n", [...cur.nodes.map((n) => n.id), ...target.nodes.map((n) => n.id)]);
    touch("p", [...cur.placements.map((x) => x.id), ...target.placements.map((x) => x.id)]);
    setNodes(target.nodes);
    setPlacements(target.placements);
    if (isLocal) return;
    try {
      await syncScenarioDb(supabase, cur, target);
    } catch (e) {
      toast.error("Ошибка: " + (e as Error).message);
      contentKey.current = "";
      setContentTick((t) => t + 1);
    }
  }

  async function undo() {
    if (!canEdit || history.past.length === 0) return;
    const target = history.past[history.past.length - 1];
    const current: Snapshot = { nodes, placements };
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [...h.future, current] }));
    await applySnapshot(target);
  }

  async function redo() {
    if (!canEdit || history.future.length === 0) return;
    const target = history.future[history.future.length - 1];
    const current: Snapshot = { nodes, placements };
    setHistory((h) => ({ past: [...h.past, current], future: h.future.slice(0, -1) }));
    await applySnapshot(target);
  }

  async function persistRollback(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (isLocal) return;
    const { error } = await fn();
    if (error) {
      toast.error("Ошибка: " + error.message);
      contentKey.current = "";
      setContentTick((t) => t + 1);
    }
  }

  function upsertPlacementState(next: OrgPlacement | null, removeId?: string) {
    setPlacements((prev) => {
      const without = removeId ? prev.filter((p) => p.id !== removeId) : prev;
      if (!next) return without;
      const i = without.findIndex((p) => p.id === next.id);
      if (i >= 0) {
        const copy = [...without];
        copy[i] = next;
        return copy;
      }
      return [...without, next];
    });
  }

  async function placeEmployee(employeeId: string, nodeId: string | null) {
    if (!canEdit) return;
    const emp = people.find((p) => p.id === employeeId);
    if (!emp) return;
    const origin = realityNodeFor(emp, nodes);
    const existing = placements.find((p) => p.employee_id === employeeId);
    const sameAsReality = nodeId === origin; // включая «оба null»
    if (sameAsReality) {
      if (existing) {
        recordHistory();
        touch("p", [existing.id]);
        upsertPlacementState(null, existing.id);
        await persistRollback(() => supabase.from("org_placements").delete().eq("id", existing.id));
      }
      return;
    }
    if (existing) {
      if (existing.node_id === nodeId) return;
      recordHistory();
      touch("p", [existing.id]);
      upsertPlacementState({ ...existing, node_id: nodeId });
      await persistRollback(() => supabase.from("org_placements").update({ node_id: nodeId }).eq("id", existing.id));
      return;
    }
    const row: OrgPlacement = {
      id: crypto.randomUUID(),
      scenario_id: scenarioIdForRows,
      node_id: nodeId,
      employee_id: employeeId,
      candidate_id: null,
      vacancy_label: null,
      sort_order: 0,
    };
    recordHistory();
    touch("p", [row.id]);
    upsertPlacementState(row);
    await persistRollback(() => supabase.from("org_placements").insert(row));
  }

  async function placeCandidate(candidateId: string, nodeId: string | null) {
    if (!canEdit) return;
    const existing = placements.find((p) => p.candidate_id === candidateId);
    if (existing) {
      if (existing.node_id === nodeId) return;
      recordHistory();
      touch("p", [existing.id]);
      upsertPlacementState({ ...existing, node_id: nodeId });
      await persistRollback(() => supabase.from("org_placements").update({ node_id: nodeId }).eq("id", existing.id));
      return;
    }
    const row: OrgPlacement = {
      id: crypto.randomUUID(),
      scenario_id: scenarioIdForRows,
      node_id: nodeId,
      employee_id: null,
      candidate_id: candidateId,
      vacancy_label: null,
      sort_order: 0,
    };
    recordHistory();
    touch("p", [row.id]);
    upsertPlacementState(row);
    await persistRollback(() => supabase.from("org_placements").insert(row));
  }

  async function addVacancy(nodeId: string, label: string) {
    if (!canEdit || !label.trim()) return;
    const row: OrgPlacement = {
      id: crypto.randomUUID(),
      scenario_id: scenarioIdForRows,
      node_id: nodeId,
      employee_id: null,
      candidate_id: null,
      vacancy_label: label.trim(),
      sort_order: 0,
    };
    recordHistory();
    touch("p", [row.id]);
    upsertPlacementState(row);
    await persistRollback(() => supabase.from("org_placements").insert(row));
  }

  async function moveVacancy(placementId: string, nodeId: string) {
    if (!canEdit) return;
    const existing = placements.find((p) => p.id === placementId);
    if (!existing || existing.node_id === nodeId) return;
    recordHistory();
    touch("p", [placementId]);
    upsertPlacementState({ ...existing, node_id: nodeId });
    await persistRollback(() => supabase.from("org_placements").update({ node_id: nodeId }).eq("id", placementId));
  }

  async function removeVacancy(placementId: string) {
    if (!canEdit) return;
    recordHistory();
    touch("p", [placementId]);
    upsertPlacementState(null, placementId);
    await persistRollback(() => supabase.from("org_placements").delete().eq("id", placementId));
  }

  // ── Структура (дерево) ──
  type NodePatch = Partial<
    Pick<OrgNode, "kind" | "title_fr" | "title_ru" | "color" | "role_key" | "team_id" | "description" | "ckp" | "contact" | "notes">
  >;

  async function addNode(parentId: string | null, kind: OrgNodeKind, patch: NodePatch = {}): Promise<string | null> {
    if (!canEdit) return null;
    const siblings = nodes.filter((n) => n.parent_id === parentId);
    const row: OrgNode = {
      id: crypto.randomUUID(),
      scenario_id: scenarioIdForRows,
      parent_id: parentId,
      kind,
      title_fr: patch.title_fr ?? "",
      title_ru: patch.title_ru ?? "",
      color: patch.color ?? null,
      sort_order: siblings.length ? Math.max(...siblings.map((s) => s.sort_order)) + 1 : 0,
      role_key: patch.role_key ?? null,
      team_id: patch.team_id ?? null,
      description: patch.description ?? null,
      ckp: patch.ckp ?? null,
      contact: patch.contact ?? null,
      notes: patch.notes ?? null,
    };
    recordHistory();
    touch("n", [row.id]);
    setNodes((prev) => [...prev, row]);
    await persistRollback(() => supabase.from("org_nodes").insert(row));
    return row.id;
  }

  async function updateNode(id: string, patch: NodePatch) {
    if (!canEdit) return;
    recordHistory();
    touch("n", [id]);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    await persistRollback(() => supabase.from("org_nodes").update(patch).eq("id", id));
  }

  async function deleteNode(id: string) {
    if (!canEdit) return;
    const gone = descendantIds(nodes, id);
    gone.add(id);
    recordHistory();
    touch("n", [...gone]);
    touch("p", placements.filter((p) => p.node_id && gone.has(p.node_id)).map((p) => p.id));
    setNodes((prev) => prev.filter((n) => !gone.has(n.id)));
    setPlacements((prev) => prev.filter((p) => !p.node_id || !gone.has(p.node_id)));
    await persistRollback(() => supabase.from("org_nodes").delete().eq("id", id));
  }

  async function moveNode(id: string, parentId: string | null) {
    if (!canEdit) return;
    const node = nodes.find((n) => n.id === id);
    if (!node || node.parent_id === parentId || id === parentId) return;
    if (parentId && descendantIds(nodes, id).has(parentId)) {
      toast.error("Нельзя переместить блок внутрь самого себя");
      return;
    }
    const siblings = nodes.filter((n) => n.parent_id === parentId && n.id !== id);
    const order = siblings.length ? Math.max(...siblings.map((s) => s.sort_order)) + 1 : 0;
    recordHistory();
    touch("n", [id]);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, parent_id: parentId, sort_order: order } : n)));
    await persistRollback(() => supabase.from("org_nodes").update({ parent_id: parentId, sort_order: order }).eq("id", id));
  }

  async function shiftNode(id: string, dir: -1 | 1) {
    if (!canEdit) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const sibs = nodes.filter((n) => n.parent_id === node.parent_id).sort(compareNodes);
    const i = sibs.findIndex((n) => n.id === id);
    const j = i + dir;
    if (j < 0 || j >= sibs.length) return;
    const reordered = [...sibs];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    const orderOf = new Map(reordered.map((n, k) => [n.id, k]));
    recordHistory();
    touch("n", reordered.map((n) => n.id));
    setNodes((prev) => prev.map((n) => (orderOf.has(n.id) ? { ...n, sort_order: orderOf.get(n.id)! } : n)));
    if (isLocal) return;
    const results = await Promise.all(
      reordered.map((n, k) => supabase.from("org_nodes").update({ sort_order: k }).eq("id", n.id))
    );
    if (results.some((r) => r.error)) {
      toast.error("Ошибка при сохранении порядка");
      contentKey.current = "";
      setContentTick((t) => t + 1);
    }
  }

  return {
    // данные
    people,
    teams,
    candidates,
    scenarios,
    published,
    nodes,
    placements,
    resolved,
    diff,
    // состояние
    schemaReady,
    loading: baseLoading || contentLoading,
    mode,
    isLocal,
    canPlan,
    canEdit,
    activeScenario,
    selectedScenario,
    // выбор
    chooseMode,
    chooseScenario,
    // сценарии
    createScenario,
    saveLocalAsScenario,
    setStatus,
    renameScenario,
    deleteScenario,
    resetLocal,
    reload: async () => {
      await loadBase();
      reloadContent();
    },
    // правки
    placeEmployee,
    placeCandidate,
    addVacancy,
    moveVacancy,
    removeVacancy,
    addNode,
    updateNode,
    deleteNode,
    moveNode,
    shiftNode,
    batch,
    // совместная работа
    myEmail,
    peers,
    setFocus,
    // история
    undo,
    redo,
    canUndo: canEdit && history.past.length > 0,
    canRedo: canEdit && history.future.length > 0,
  };
}

export type OrgPlan = ReturnType<typeof useOrgPlan>;

/** Порядок колонок офиса (F1): глобально для всех, хранится в org_bureau_order. */
export function useBureauOrder(supabase: Supabase) {
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.from("org_bureau_order").select("role, sort_order");
      if (cancelled) return;
      if (error) {
        setAvailable(false);
        return;
      }
      setAvailable(true);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { role: string; sort_order: number }) => (map[r.role] = r.sort_order));
      setSaved(map);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const roles = useMemo(() => orderedBureauRoles(saved), [saved]);

  async function save(next: string[]) {
    const map: Record<string, number> = {};
    next.forEach((r, i) => (map[r] = i));
    setSaved(map);
    const { error } = await supabase
      .from("org_bureau_order")
      .upsert(next.map((role, i) => ({ role, sort_order: i })), { onConflict: "role" });
    if (error) toast.error("Ошибка: " + error.message);
  }

  async function reset() {
    setSaved({});
    const { error } = await supabase.from("org_bureau_order").delete().in("role", BUREAU_ROLE_ORDER);
    if (error) toast.error("Ошибка: " + error.message);
  }

  return { roles, available, isCustom: Object.keys(saved).length > 0, save, reset };
}
