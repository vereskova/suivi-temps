// Модель оргструктуры: сценарии («План») поверх реального состава.
// Чистые функции без обращения к базе — всё, что касается UI и Supabase, в app/admin/org/.
// См. docs/tz-orgstructura.md.

export const BUREAU_ROLE_LABELS: Record<string, string> = {
  boss: "Boss",
  rh: "RH",
  assistant: "Assistante de direction",
  coach: "Coach",
  production: "Production",
  planning: "Planning",
  comptable: "Comptable",
  marketing: "Marketing",
  control: "Contrôle qualité",
  formation_officer: "Formation",
  depot: "Dépôt",
  hotel: "Hôtel",
};

export const BUREAU_ROLE_LABELS_RU: Record<string, string> = {
  boss: "Босс",
  rh: "Кадры",
  assistant: "Ассистент руководителя",
  coach: "Коуч",
  production: "Производство",
  planning: "Планирование",
  comptable: "Бухгалтер",
  marketing: "Маркетинг",
  control: "Контроль качества",
  formation_officer: "Обучение",
  depot: "Склад",
  hotel: "Отель",
};

/** Порядок блоков офиса по умолчанию (пожелание Kate, 14/10/2026): руководитель,
 *  ассистент, коуч, найм, маркетинг, бухгалтерия, планирование, склад, отель,
 *  производство, обучение, качество. Меняется перетаскиванием (org_bureau_order). */
export const BUREAU_ROLE_ORDER = [
  "boss",
  "assistant",
  "coach",
  "rh",
  "marketing",
  "comptable",
  "planning",
  "depot",
  "hotel",
  "production",
  "formation_officer",
  "control",
];

/** "Equipe 3" -> "Бригада 3" */
export function teamLabelRu(name: string): string {
  return name.replace(/^équipe/i, "Бригада").replace(/^equipe/i, "Бригада");
}

/** Применяет сохранённый порядок (org_bureau_order) к списку ролей по умолчанию.
 *  Роли без сохранённой позиции идут в конце в порядке по умолчанию. */
export function orderedBureauRoles(saved: Record<string, number>): string[] {
  const hasSaved = Object.keys(saved).length > 0;
  if (!hasSaved) return [...BUREAU_ROLE_ORDER];
  return [...BUREAU_ROLE_ORDER].sort((a, b) => {
    const sa = saved[a] ?? 1000 + BUREAU_ROLE_ORDER.indexOf(a);
    const sb = saved[b] ?? 1000 + BUREAU_ROLE_ORDER.indexOf(b);
    return sa - sb;
  });
}

// ── Типы ──────────────────────────────────────────────────────────────────

export type OrgNodeKind = "block" | "section" | "subsection" | "position" | "team" | "external";

export const ORG_NODE_KIND_LABELS: Record<OrgNodeKind, string> = {
  block: "Блок",
  section: "Секция",
  subsection: "Подсекция",
  position: "Должность (роль офиса)",
  team: "Бригада",
  external: "Внешний подрядчик",
};

export type OrgScenarioStatus = "draft" | "review" | "approved" | "published" | "archived";

export const ORG_STATUS_LABELS: Record<OrgScenarioStatus, { ru: string; badge: string }> = {
  draft: { ru: "Черновик", badge: "badge-warning" },
  review: { ru: "На согласовании", badge: "badge-warning" },
  approved: { ru: "Утверждён", badge: "badge-success" },
  published: { ru: "Опубликован", badge: "badge-success" },
  archived: { ru: "В архиве", badge: "badge-error" },
};

export type OrgScenario = {
  id: string;
  title: string;
  status: OrgScenarioStatus;
  created_by_email: string | null;
  approved_by_email: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgNode = {
  id: string;
  scenario_id: string;
  parent_id: string | null;
  kind: OrgNodeKind;
  title_fr: string;
  title_ru: string;
  color: string | null;
  sort_order: number;
  role_key: string | null;
  team_id: string | null;
  description: string | null;
  ckp: string | null;
  contact: string | null;
  notes: string | null;
};

export type OrgPlacement = {
  id: string;
  scenario_id: string;
  node_id: string | null;
  employee_id: string | null;
  candidate_id: string | null;
  vacancy_label: string | null;
  sort_order: number;
};

export type OrgPerson = {
  id: string;
  first_name: string;
  last_name: string;
  category: "bureau" | "chantier";
  bureau_role: string | null;
  team_id: string | null;
  secondary_team_id: string | null;
  org_sort_order: number | null;
  badge_emoji: string | null;
  can_substitute: boolean;
  hire_date: string | null;
  status: string;
};

export type OrgCandidateLite = {
  id: string;
  full_name: string | null;
  position_label: string;
  category: string;
  team_id: string | null;
  team_label: string | null;
  status: string;
  arrival_date: string | null;
};

export type OrgTeamLite = { id: string; name: string; chef_employee_id: string | null };

// ── Дерево ────────────────────────────────────────────────────────────────

export function compareNodes(a: OrgNode, b: OrgNode): number {
  return a.sort_order - b.sort_order || a.title_ru.localeCompare(b.title_ru) || a.id.localeCompare(b.id);
}

export function childrenMap(nodes: OrgNode[]): Map<string | null, OrgNode[]> {
  const map = new Map<string | null, OrgNode[]>();
  nodes.forEach((n) => {
    const key = n.parent_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  });
  map.forEach((list) => list.sort(compareNodes));
  return map;
}

export type FlatNode = { node: OrgNode; depth: number; rootId: string };

/** Узлы в порядке обхода дерева (родитель, затем его дети). */
export function treeOrder(nodes: OrgNode[]): FlatNode[] {
  const kids = childrenMap(nodes);
  const ids = new Set(nodes.map((n) => n.id));
  const out: FlatNode[] = [];
  const walk = (n: OrgNode, depth: number, rootId: string) => {
    out.push({ node: n, depth, rootId });
    (kids.get(n.id) ?? []).forEach((c) => walk(c, depth + 1, rootId));
  };
  // Корни: parent_id null, либо родитель отсутствует (защита от «потерянных» узлов).
  const roots = nodes.filter((n) => n.parent_id === null || !ids.has(n.parent_id)).sort(compareNodes);
  roots.forEach((r) => walk(r, 0, r.id));
  return out;
}

export function descendantIds(nodes: OrgNode[], id: string): Set<string> {
  const kids = childrenMap(nodes);
  const out = new Set<string>();
  const walk = (nid: string) => {
    (kids.get(nid) ?? []).forEach((c) => {
      out.add(c.id);
      walk(c.id);
    });
  };
  walk(id);
  return out;
}

export function nodeTitle(n: OrgNode): { fr: string; ru: string } {
  const fr = n.title_fr || (n.role_key ? BUREAU_ROLE_LABELS[n.role_key] : "") || n.title_ru || "—";
  const ru = n.title_ru || (n.role_key ? BUREAU_ROLE_LABELS_RU[n.role_key] : "") || "";
  return { fr, ru };
}

/** Узел, где сотрудник стоит в реальности: роль офиса → узел-должность, бригада → узел-бригада. */
export function realityNodeFor(e: OrgPerson, nodes: OrgNode[]): string | null {
  const sorted = [...nodes].sort(compareNodes);
  if (e.category === "bureau") {
    if (!e.bureau_role) return null;
    return sorted.find((n) => n.kind === "position" && n.role_key === e.bureau_role)?.id ?? null;
  }
  if (!e.team_id) return null;
  return sorted.find((n) => n.kind === "team" && n.team_id === e.team_id)?.id ?? null;
}

// ── Карточки людей в узлах ────────────────────────────────────────────────

export type PlanCard = {
  key: string; // e:<id> | c:<id> | v:<placementId>
  kind: "employee" | "candidate" | "vacancy";
  employee?: OrgPerson;
  candidate?: OrgCandidateLite;
  placementId?: string;
  label?: string; // название вакансии
  /** Узел, где карточка показана сейчас (null = вне схемы). */
  nodeId: string | null;
  /** Где человек стоит в реальности (узел по роли/бригаде) — для сотрудников. */
  originNodeId: string | null;
  moved: boolean;
  /** Сотрудник офиса, прикреплённый к бригаде: показан в колонке бригады только для информации. */
  attached?: boolean;
};

export type ResolvedPeople = {
  byNode: Map<string, PlanCard[]>;
  /** Сотрудники без места в схеме (нет узла для их роли/бригады или отправлены в резерв). */
  unplacedEmployees: PlanCard[];
  /** Кандидаты, ещё не поставленные на место. */
  unplacedCandidates: PlanCard[];
  /** Размещения сотрудников, которые уже не работают. */
  inactivePlacements: { placementId: string; employeeName: string }[];
};

function personSort(a: OrgPerson, b: OrgPerson): number {
  return (
    (a.org_sort_order ?? Number.MAX_SAFE_INTEGER) - (b.org_sort_order ?? Number.MAX_SAFE_INTEGER) ||
    a.last_name.localeCompare(b.last_name)
  );
}

/**
 * Кто где стоит. `useOverrides=false` — «Сейчас» (чистая реальность, размещения сценария игнорируются).
 * Сотрудник без размещения стоит там, где он стоит в карточке (роль офиса → узел-должность,
 * бригада → узел-бригада).
 */
export function resolvePeople(args: {
  nodes: OrgNode[];
  placements: OrgPlacement[];
  employees: OrgPerson[];
  candidates: OrgCandidateLite[];
  useOverrides: boolean;
}): ResolvedPeople {
  const { nodes, placements, employees, candidates, useOverrides } = args;
  const roleNode = new Map<string, string>();
  const teamNode = new Map<string, string>();
  [...nodes].sort(compareNodes).forEach((n) => {
    if (n.kind === "position" && n.role_key && !roleNode.has(n.role_key)) roleNode.set(n.role_key, n.id);
    if (n.kind === "team" && n.team_id && !teamNode.has(n.team_id)) teamNode.set(n.team_id, n.id);
  });
  const nodeIds = new Set(nodes.map((n) => n.id));

  const byNode = new Map<string, PlanCard[]>();
  const push = (nodeId: string, card: PlanCard) => {
    if (!byNode.has(nodeId)) byNode.set(nodeId, []);
    byNode.get(nodeId)!.push(card);
  };

  const empPlacement = new Map<string, OrgPlacement>();
  const candPlacement = new Map<string, OrgPlacement>();
  const vacancies: OrgPlacement[] = [];
  if (useOverrides) {
    placements.forEach((p) => {
      if (p.employee_id) empPlacement.set(p.employee_id, p);
      else if (p.candidate_id) candPlacement.set(p.candidate_id, p);
      else if (p.vacancy_label) vacancies.push(p);
    });
  }

  const unplacedEmployees: PlanCard[] = [];
  const inactivePlacements: { placementId: string; employeeName: string }[] = [];

  const active = employees.filter((e) => e.status === "active").sort(personSort);
  const activeIds = new Set(active.map((e) => e.id));

  active.forEach((e) => {
    const origin = e.category === "bureau" ? (e.bureau_role ? roleNode.get(e.bureau_role) ?? null : null) : e.team_id ? teamNode.get(e.team_id) ?? null : null;
    const p = empPlacement.get(e.id);
    let nodeId: string | null = origin;
    let moved = false;
    if (p) {
      if (p.node_id === null) {
        nodeId = null;
        moved = true;
      } else if (nodeIds.has(p.node_id)) {
        nodeId = p.node_id;
        moved = p.node_id !== origin;
      }
    }
    const card: PlanCard = {
      key: `e:${e.id}`,
      kind: "employee",
      employee: e,
      placementId: p?.id,
      nodeId,
      originNodeId: origin,
      moved,
    };
    if (nodeId) push(nodeId, card);
    else unplacedEmployees.push(card);

    // Сотрудник офиса, прикреплённый к бригаде: показываем и в колонке бригады (как в «Сейчас»).
    if (!p && e.category === "bureau" && e.secondary_team_id) {
      const tn = teamNode.get(e.secondary_team_id);
      if (tn) push(tn, { ...card, key: `e:${e.id}@team`, nodeId: tn, attached: true });
    }
  });

  empPlacement.forEach((p, empId) => {
    if (!activeIds.has(empId)) {
      const e = employees.find((x) => x.id === empId);
      inactivePlacements.push({ placementId: p.id, employeeName: e ? `${e.last_name} ${e.first_name}` : "—" });
    }
  });

  const unplacedCandidates: PlanCard[] = [];
  const roleByLabel = new Map<string, string>();
  Object.entries(BUREAU_ROLE_LABELS).forEach(([role, label]) => roleByLabel.set(label.toLowerCase(), role));
  Object.entries(BUREAU_ROLE_LABELS_RU).forEach(([role, label]) => roleByLabel.set(label.toLowerCase(), role));

  candidates
    .filter((c) => c.status !== "rejected" && c.status !== "arrived")
    .forEach((c) => {
      const p = candPlacement.get(c.id);
      const card: PlanCard = {
        key: `c:${c.id}`,
        kind: "candidate",
        candidate: c,
        placementId: p?.id,
        nodeId: null,
        originNodeId: null,
        moved: !!p,
      };
      if (p) {
        // Явное размещение: в узел, либо «без места» (node_id null / узел удалён) — правило по умолчанию не применяется.
        if (p.node_id && nodeIds.has(p.node_id)) {
          card.nodeId = p.node_id;
          push(p.node_id, card);
        } else {
          unplacedCandidates.push(card);
        }
        return;
      }
      // Без явного размещения кандидат стоит там, где его ждут (роль / бригада), как в прежней песочнице.
      let initial: string | null = null;
      if (useOverrides) {
        if (c.category === "bureau") {
          const role = roleByLabel.get(c.position_label.trim().toLowerCase());
          initial = role ? roleNode.get(role) ?? null : null;
        } else if (c.team_id) {
          initial = teamNode.get(c.team_id) ?? null;
        }
      }
      if (initial) {
        card.nodeId = initial;
        push(initial, card);
      } else {
        unplacedCandidates.push(card);
      }
    });

  vacancies.forEach((p) => {
    if (p.node_id && nodeIds.has(p.node_id)) {
      push(p.node_id, {
        key: `v:${p.id}`,
        kind: "vacancy",
        placementId: p.id,
        label: p.vacancy_label ?? "",
        nodeId: p.node_id,
        originNodeId: null,
        moved: true,
      });
    }
  });

  return { byNode, unplacedEmployees, unplacedCandidates, inactivePlacements };
}

// ── Отличия от реальности ─────────────────────────────────────────────────

export type PlanDiffItem = { type: "moved" | "reserve" | "candidate" | "vacancy" | "inactive"; text: string };

export function planDiff(args: {
  nodes: OrgNode[];
  placements: OrgPlacement[];
  employees: OrgPerson[];
  candidates: OrgCandidateLite[];
}): PlanDiffItem[] {
  const { nodes } = args;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const title = (id: string | null) => (id && byId.get(id) ? nodeTitle(byId.get(id)!).ru || nodeTitle(byId.get(id)!).fr : "—");
  const res = resolvePeople({ ...args, useOverrides: true });
  const out: PlanDiffItem[] = [];
  const all: PlanCard[] = [...res.unplacedEmployees, ...Array.from(res.byNode.values()).flat()];
  all
    .filter((c) => c.kind === "employee" && c.moved && !c.attached)
    .forEach((c) => {
      const e = c.employee!;
      const name = `${e.last_name} ${e.first_name}`;
      if (c.nodeId === null) out.push({ type: "reserve", text: `${name}: в резерв (сейчас: ${title(c.originNodeId)})` });
      else out.push({ type: "moved", text: `${name}: ${title(c.originNodeId)} → ${title(c.nodeId)}` });
    });
  args.placements
    .filter((p) => p.candidate_id && p.node_id)
    .forEach((p) => {
      const c = args.candidates.find((x) => x.id === p.candidate_id);
      out.push({ type: "candidate", text: `Кандидат ${c?.full_name || c?.position_label || "—"} → ${title(p.node_id)}` });
    });
  args.placements
    .filter((p) => p.vacancy_label && p.node_id)
    .forEach((p) => out.push({ type: "vacancy", text: `Вакансия «${p.vacancy_label}» → ${title(p.node_id)}` }));
  res.inactivePlacements.forEach((p) =>
    out.push({ type: "inactive", text: `${p.employeeName}: в плане стоит, но больше не работает в компании` })
  );
  return out;
}

// ── Шаблоны структуры ─────────────────────────────────────────────────────

export type NodeSeed = {
  key: string;
  parentKey: string | null;
  kind: OrgNodeKind;
  title_fr: string;
  title_ru: string;
  color?: string;
  role_key?: string;
  team_id?: string;
  description?: string;
  ckp?: string;
};

function sortedTeams(teams: OrgTeamLite[]): OrgTeamLite[] {
  return [...teams].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Плоская схема «как сейчас»: Офис (роли) и Стройка (бригады). */
export function flatTemplate(teams: OrgTeamLite[], roleOrder: string[] = BUREAU_ROLE_ORDER): NodeSeed[] {
  const seeds: NodeSeed[] = [
    { key: "office", parentKey: null, kind: "block", title_fr: "Bureau", title_ru: "Бюро", color: "amber" },
    { key: "chantier", parentKey: null, kind: "block", title_fr: "Chantier", title_ru: "Стройка", color: "stone" },
  ];
  roleOrder.forEach((role) =>
    seeds.push({
      key: `role:${role}`,
      parentKey: "office",
      kind: "position",
      title_fr: BUREAU_ROLE_LABELS[role],
      title_ru: BUREAU_ROLE_LABELS_RU[role],
      role_key: role,
    })
  );
  sortedTeams(teams).forEach((t) =>
    seeds.push({
      key: `team:${t.id}`,
      parentKey: "chantier",
      kind: "team",
      title_fr: t.name,
      title_ru: teamLabelRu(t.name),
      team_id: t.id,
    })
  );
  return seeds;
}

/** Предложенная структура по Высоцкому (docs/tz-orgstructura.md, п. 6) — стартовые данные для черновика. */
export function visotskyTemplate(teams: OrgTeamLite[]): NodeSeed[] {
  const pos = (role: string, parentKey: string): NodeSeed => ({
    key: `role:${role}`,
    parentKey,
    kind: "position",
    title_fr: BUREAU_ROLE_LABELS[role],
    title_ru: BUREAU_ROLE_LABELS_RU[role],
    role_key: role,
  });
  const seeds: NodeSeed[] = [
    {
      key: "b7",
      parentKey: null,
      kind: "block",
      title_fr: "Administratif",
      title_ru: "Административное (управление)",
      color: "sky",
      description: "Определяет цели, политику и стратегию, планирует деятельность компании.",
    },
    pos("boss", "b7"),
    pos("assistant", "b7"),
    pos("coach", "b7"),
    {
      key: "b1",
      parentKey: null,
      kind: "block",
      title_fr: "Construction / Recrutement",
      title_ru: "Построения (найм и обеспечение)",
      color: "amber",
      description: "Оргструктура, найм и ввод в должность, стандарты, коммуникации. Отели и билеты — «обеспечение».",
    },
    pos("rh", "b1"),
    pos("hotel", "b1"),
    {
      key: "b2",
      parentKey: null,
      kind: "block",
      title_fr: "Diffusion / Marketing",
      title_ru: "Распространения (маркетинг)",
      color: "rose",
      description: "Маркетинговые кампании, материалы по продаже продукции.",
    },
    pos("marketing", "b2"),
    {
      key: "b3",
      parentKey: null,
      kind: "block",
      title_fr: "Finances",
      title_ru: "Финансовое (бухгалтерия)",
      color: "emerald",
      description: "Счета, учёт, отчёты, финансовое планирование.",
    },
    pos("comptable", "b3"),
    { key: "ext:acc_fr", parentKey: "b3", kind: "external", title_fr: "Comptabilité (France)", title_ru: "Бухгалтерия (Франция)" },
    { key: "ext:acc_local", parentKey: "b3", kind: "external", title_fr: "Comptabilité (locale)", title_ru: "Бухгалтерия (местная)" },
    {
      key: "b4",
      parentKey: null,
      kind: "block",
      title_fr: "Production",
      title_ru: "Техническое (производство)",
      color: "orange",
      description: "Непосредственно производит продукт компании и обеспечивает производство.",
    },
    pos("production", "b4"),
    { key: "teams", parentKey: "b4", kind: "section", title_fr: "Équipes", title_ru: "Бригады" },
    pos("planning", "b4"),
    pos("depot", "b4"),
    {
      key: "b5",
      parentKey: null,
      kind: "block",
      title_fr: "Qualification",
      title_ru: "Квалификации (обучение и качество)",
      color: "teal",
      description: "Контроль качества, обучение и контроль персонала.",
    },
    pos("formation_officer", "b5"),
    pos("control", "b5"),
    {
      key: "bext",
      parentKey: null,
      kind: "block",
      title_fr: "Prestataires externes",
      title_ru: "Внешние подрядчики",
      color: "stone",
    },
    { key: "ext:cars", parentKey: "bext", kind: "external", title_fr: "Réparation de véhicules", title_ru: "Ремонт автомобилей" },
    { key: "ext:legal", parentKey: "bext", kind: "external", title_fr: "Services juridiques", title_ru: "Юридические услуги" },
  ];
  sortedTeams(teams).forEach((t) =>
    seeds.push({
      key: `team:${t.id}`,
      parentKey: "teams",
      kind: "team",
      title_fr: t.name,
      title_ru: teamLabelRu(t.name),
      team_id: t.id,
    })
  );
  return seeds;
}

/** Превращает шаблон в строки org_nodes с готовыми uuid (родители раньше детей). */
export function seedsToNodes(scenarioId: string, seeds: NodeSeed[]): OrgNode[] {
  const ids = new Map<string, string>();
  seeds.forEach((s) => ids.set(s.key, crypto.randomUUID()));
  const orderInParent = new Map<string | null, number>();
  return seeds.map((s) => {
    const parent = s.parentKey ? ids.get(s.parentKey) ?? null : null;
    const order = orderInParent.get(parent) ?? 0;
    orderInParent.set(parent, order + 1);
    return {
      id: ids.get(s.key)!,
      scenario_id: scenarioId,
      parent_id: parent,
      kind: s.kind,
      title_fr: s.title_fr,
      title_ru: s.title_ru,
      color: s.color ?? null,
      sort_order: order,
      role_key: s.role_key ?? null,
      team_id: s.team_id ?? null,
      description: s.description ?? null,
      ckp: s.ckp ?? null,
      contact: null,
      notes: null,
    };
  });
}

/** Копия дерева и размещений в новый сценарий (новые uuid). */
export function cloneScenarioRows(
  newScenarioId: string,
  nodes: OrgNode[],
  placements: OrgPlacement[]
): { nodes: OrgNode[]; placements: OrgPlacement[] } {
  const map = new Map<string, string>();
  nodes.forEach((n) => map.set(n.id, crypto.randomUUID()));
  return {
    nodes: nodes.map((n) => ({
      ...n,
      id: map.get(n.id)!,
      scenario_id: newScenarioId,
      parent_id: n.parent_id ? map.get(n.parent_id) ?? null : null,
    })),
    placements: placements.map((p) => ({
      ...p,
      id: crypto.randomUUID(),
      scenario_id: newScenarioId,
      node_id: p.node_id ? map.get(p.node_id) ?? null : null,
    })),
  };
}

// ── Палитра блоков ────────────────────────────────────────────────────────

export const ORG_COLORS = [
  "sky",
  "amber",
  "rose",
  "emerald",
  "orange",
  "teal",
  "violet",
  "stone",
  // ещё 20 цветов
  "red",
  "coral",
  "maroon",
  "pink",
  "fuchsia",
  "purple",
  "plum",
  "indigo",
  "blue",
  "navy",
  "cyan",
  "mint",
  "green",
  "forest",
  "lime",
  "olive",
  "yellow",
  "gold",
  "slate",
  "brown",
] as const;
export type OrgColor = (typeof ORG_COLORS)[number];

/** Статические классы Tailwind (динамические имена классов не попали бы в сборку). */
export const ORG_COLOR_CLASSES: Record<string, { header: string; border: string; soft: string }> = {
  sky: { header: "bg-sky-600 text-white", border: "border-sky-300", soft: "bg-sky-50" },
  amber: { header: "bg-amber-500 text-white", border: "border-amber-300", soft: "bg-amber-50" },
  rose: { header: "bg-rose-500 text-white", border: "border-rose-300", soft: "bg-rose-50" },
  emerald: { header: "bg-emerald-600 text-white", border: "border-emerald-300", soft: "bg-emerald-50" },
  orange: { header: "bg-orange-500 text-white", border: "border-orange-300", soft: "bg-orange-50" },
  teal: { header: "bg-teal-600 text-white", border: "border-teal-300", soft: "bg-teal-50" },
  violet: { header: "bg-violet-600 text-white", border: "border-violet-300", soft: "bg-violet-50" },
  stone: { header: "bg-stone-700 text-white", border: "border-stone-300", soft: "bg-stone-50" },
  red: { header: "bg-red-600 text-white", border: "border-red-300", soft: "bg-red-50" },
  coral: { header: "bg-red-400 text-white", border: "border-red-200", soft: "bg-red-50" },
  maroon: { header: "bg-red-900 text-white", border: "border-red-400", soft: "bg-red-50" },
  pink: { header: "bg-pink-500 text-white", border: "border-pink-300", soft: "bg-pink-50" },
  fuchsia: { header: "bg-fuchsia-600 text-white", border: "border-fuchsia-300", soft: "bg-fuchsia-50" },
  purple: { header: "bg-purple-600 text-white", border: "border-purple-300", soft: "bg-purple-50" },
  plum: { header: "bg-purple-900 text-white", border: "border-purple-400", soft: "bg-purple-50" },
  indigo: { header: "bg-indigo-600 text-white", border: "border-indigo-300", soft: "bg-indigo-50" },
  blue: { header: "bg-blue-600 text-white", border: "border-blue-300", soft: "bg-blue-50" },
  navy: { header: "bg-blue-900 text-white", border: "border-blue-400", soft: "bg-blue-50" },
  cyan: { header: "bg-cyan-600 text-white", border: "border-cyan-300", soft: "bg-cyan-50" },
  mint: { header: "bg-emerald-400 text-white", border: "border-emerald-200", soft: "bg-emerald-50" },
  green: { header: "bg-green-600 text-white", border: "border-green-300", soft: "bg-green-50" },
  forest: { header: "bg-green-900 text-white", border: "border-green-400", soft: "bg-green-50" },
  lime: { header: "bg-lime-600 text-white", border: "border-lime-300", soft: "bg-lime-50" },
  olive: { header: "bg-lime-800 text-white", border: "border-lime-400", soft: "bg-lime-50" },
  yellow: { header: "bg-yellow-400 text-stone-900", border: "border-yellow-300", soft: "bg-yellow-50" },
  gold: { header: "bg-yellow-600 text-white", border: "border-yellow-300", soft: "bg-yellow-50" },
  slate: { header: "bg-slate-600 text-white", border: "border-slate-300", soft: "bg-slate-50" },
  brown: { header: "bg-amber-900 text-white", border: "border-amber-400", soft: "bg-amber-50" },
};

/** Цвета блоков по умолчанию (как в предложенной структуре по Высоцкому) — для режима «Сейчас», пока схема не опубликована. */
export const DEFAULT_ROLE_COLORS: Record<string, string> = {
  boss: "sky",
  assistant: "sky",
  coach: "sky",
  rh: "amber",
  hotel: "amber",
  marketing: "rose",
  comptable: "emerald",
  production: "orange",
  planning: "orange",
  depot: "orange",
  formation_officer: "teal",
  control: "teal",
};
export const DEFAULT_TEAM_COLOR = "orange";

/** Цвет узла: свой или унаследованный от ближайшего родителя с цветом. */
export function inheritedColor(nodes: OrgNode[], node: OrgNode): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur: OrgNode | undefined = node;
  let guard = 0;
  while (cur && guard++ < 50) {
    if (cur.color) return cur.color;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

/** Цвета колонок для режима «Сейчас»: берутся из опубликованной схемы, иначе из цветов по умолчанию. */
export function roleColorMap(nodes: OrgNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  [...nodes].sort(compareNodes).forEach((n) => {
    if (n.kind === "position" && n.role_key && !(n.role_key in out)) {
      const c = inheritedColor(nodes, n);
      if (c) out[n.role_key] = c;
    }
  });
  return out;
}
export function teamColorMap(nodes: OrgNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  [...nodes].sort(compareNodes).forEach((n) => {
    if (n.kind === "team" && n.team_id && !(n.team_id in out)) {
      const c = inheritedColor(nodes, n);
      if (c) out[n.team_id] = c;
    }
  });
  return out;
}

export function colorClasses(color: string | null | undefined) {
  return ORG_COLOR_CLASSES[color ?? "stone"] ?? ORG_COLOR_CLASSES.stone;
}
