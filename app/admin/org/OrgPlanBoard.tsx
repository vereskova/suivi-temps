"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  colorClasses,
  childrenMap,
  nodeTitle,
  treeOrder,
  type OrgNode,
  type PlanCard,
} from "@/lib/org/model";
import { OrgCardView, parseCardKey } from "./OrgCards";
import { PeerTags, cardFocusLabel, peerColor, peersOnNode } from "./OrgPresence";
import type { OrgPlan } from "./useOrgPlan";

const UNPLACED_EMP = "__unplaced_emp__";
const UNPLACED_CAND = "__unplaced_cand__";

/** Отличия плана от реальности - общий для обеих вкладок. */
export function OrgDiffPanel({ plan }: { plan: OrgPlan }) {
  const [open, setOpen] = useState(false);
  if (plan.mode !== "plan") return null;
  const ICON: Record<string, string> = { moved: "↔", reserve: "⏸", candidate: "＋", vacancy: "◌", inactive: "⚠" };
  return (
    <div className="card mt-4">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <span className="font-bold">
          Отличия от реальности <span className="font-normal text-stone-400">({plan.diff.length})</span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open &&
        (plan.diff.length === 0 ? (
          <p className="mt-2 text-sm text-stone-400">План совпадает с реальностью.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {plan.diff.map((d, i) => (
              <li key={i} className={d.type === "inactive" ? "text-error-600" : "text-stone-700"}>
                <span className="mr-2 inline-block w-4 text-center">{ICON[d.type]}</span>
                {d.text}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** Вид «Состав»: плоские колонки (как в «Сейчас»), расстановка перетаскиванием. Заменяет прежнюю песочницу «что если». */
export function OrgPlanBoard({ plan }: { plan: OrgPlan }) {
  const { nodes, resolved, canEdit } = plan;
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [vacancyFor, setVacancyFor] = useState<string | null>(null);
  const [vacancyText, setVacancyText] = useState("");

  const chefIds = useMemo(
    () => new Set(plan.teams.map((t) => t.chef_employee_id).filter((x): x is string => !!x)),
    [plan.teams]
  );

  const columns = useMemo(() => {
    const kids = childrenMap(nodes);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return treeOrder(nodes)
      .filter(({ node }) => {
        const hasKids = (kids.get(node.id) ?? []).length > 0;
        const hasCards = (resolved.byNode.get(node.id) ?? []).length > 0;
        return node.kind === "position" || node.kind === "team" || node.kind === "external" || !hasKids || hasCards;
      })
      .map(({ node, rootId }) => ({ node, root: byId.get(rootId) as OrgNode }));
  }, [nodes, resolved]);

  const groups = useMemo(() => {
    const out: { root: OrgNode; cols: OrgNode[] }[] = [];
    columns.forEach(({ node, root }) => {
      let g = out.find((x) => x.root.id === root.id);
      if (!g) {
        g = { root, cols: [] };
        out.push(g);
      }
      g.cols.push(node);
    });
    return out;
  }, [columns]);

  /** Сколько сотрудников стоит в узле в реальности - для пометки (+N)/(−N). */
  const originCount = useMemo(() => {
    const m = new Map<string, number>();
    [...resolved.byNode.values(), resolved.unplacedEmployees].flat().forEach((c) => {
      if (c.kind === "employee" && !c.attached && c.originNodeId) m.set(c.originNodeId, (m.get(c.originNodeId) ?? 0) + 1);
    });
    return m;
  }, [resolved]);

  function drop(targetKey: string) {
    const key = dragKey;
    setDragKey(null);
    setOver(null);
    if (!key || !canEdit) return;
    const parsed = parseCardKey(key);
    if (!parsed) return;
    const toNode = targetKey === UNPLACED_EMP || targetKey === UNPLACED_CAND ? null : targetKey;
    if (parsed.kind === "employee") {
      // Сотрудника можно убрать в резерв (nodeId = null) или поставить в узел.
      plan.placeEmployee(parsed.id, toNode);
    } else if (parsed.kind === "candidate") {
      plan.placeCandidate(parsed.id, toNode);
    } else if (toNode) {
      const card = [...resolved.byNode.values()].flat().find((c) => c.key === key);
      if (card?.placementId) plan.moveVacancy(card.placementId, toNode);
    }
  }

  function column(id: string, title: React.ReactNode, cards: PlanCard[], opts: { header: string; before?: number; node?: OrgNode }) {
    const delta = opts.before !== undefined ? cards.length - opts.before : 0;
    const colEditors = opts.node ? peersOnNode(plan, opts.node.id) : [];
    return (
      <div
        key={id}
        onDragOver={(ev) => {
          if (!canEdit) return;
          ev.preventDefault();
          setOver(id);
        }}
        onDragLeave={() => setOver((cur) => (cur === id ? null : cur))}
        onDrop={() => drop(id)}
        style={colEditors.length ? { boxShadow: `0 0 0 3px ${peerColor(colEditors[0].email)}` } : undefined}
        className={`flex min-h-24 min-w-0 flex-col gap-1.5 rounded-xl p-1.5 transition-colors ${
          over === id ? "bg-violet-50 ring-2 ring-violet-300" : "bg-white/60"
        }`}
      >
        <PeerTags peers={colEditors} />
        <div className={`break-words rounded-lg px-2 py-1.5 text-center text-[0.7rem] font-bold uppercase leading-tight tracking-wide ${opts.header}`}>
          {title}{" "}
          <span className="font-normal opacity-70">
            {cards.length}
            {delta !== 0 && <span className={delta > 0 ? "text-success-200" : "text-error-200"}> ({delta > 0 ? "+" : ""}{delta})</span>}
          </span>
        </div>
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 px-2 py-2 text-center text-xs text-stone-300">-</div>
        ) : (
          cards.map((card) => (
            <OrgCardView
              key={card.key}
              card={card}
              chefIds={chefIds}
              canDrag={canEdit}
              onDragStart={() => {
                setDragKey(card.key);
                plan.setFocus({ id: card.nodeId, label: cardFocusLabel(card) });
              }}
              onDragEnd={() => {
                setDragKey(null);
                setOver(null);
                plan.setFocus(null);
              }}
              onRemove={card.kind === "vacancy" && canEdit ? () => plan.removeVacancy(card.placementId!) : undefined}
            />
          ))
        )}
        {canEdit && opts.node && (
          vacancyFor === opts.node.id ? (
            <input
              autoFocus
              className="input text-xs"
              placeholder="Название вакансии"
              value={vacancyText}
              onChange={(e) => setVacancyText(e.target.value)}
              onBlur={() => {
                if (vacancyText.trim()) plan.addVacancy(opts.node!.id, vacancyText);
                setVacancyFor(null);
                setVacancyText("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setVacancyText("");
                  setVacancyFor(null);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setVacancyFor(opts.node!.id)}
              className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-stone-200 px-2 py-1 text-[0.65rem] text-stone-400 hover:border-error-300 hover:text-error-500"
            >
              <Plus size={10} /> вакансия
            </button>
          )
        )}
      </div>
    );
  }

  if (nodes.length === 0) return <p className="card text-center text-stone-400">В сценарии пока нет структуры.</p>;

  return (
    <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-3">
      <p className="mb-3 text-sm font-bold">
        Расстановка «Состав»{" "}
        <span className="text-xs font-normal text-stone-400">
          {canEdit
            ? "- перетаскивайте карточки между колонками. Цветная рамка = отличие от реальности."
            : "- только просмотр."}
        </span>
      </p>
      {groups.map(({ root, cols }) => {
        const rt = nodeTitle(root);
        const cc = colorClasses(root.color);
        return (
          <div key={root.id} className="mb-4">
            <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-stone-400">
              {rt.ru || rt.fr}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {cols.map((n) => {
                const t = nodeTitle(n);
                const cards = resolved.byNode.get(n.id) ?? [];
                const before = originCount.get(n.id) ?? 0;
                return column(
                  n.id,
                  <>
                    {t.fr}
                    {t.ru && t.ru !== t.fr && <span className="block break-words text-[0.6rem] font-medium normal-case opacity-70">{t.ru}</span>}
                  </>,
                  cards,
                  { header: n.kind === "external" ? "bg-stone-500 text-white" : cc.header, before, node: n }
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-2 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 p-3">
        <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-primary-600">
          Резерв и кандидаты - сюда можно убрать человека или взять оттуда
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {column(UNPLACED_EMP, "Без места", resolved.unplacedEmployees, { header: "bg-primary-600 text-white" })}
          {column(UNPLACED_CAND, "Кандидаты без места", resolved.unplacedCandidates, { header: "bg-primary-600 text-white" })}
        </div>
      </div>
    </div>
  );
}
