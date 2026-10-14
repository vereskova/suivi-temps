"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/StateMessage";
import { SkeletonRows } from "@/components/Skeleton";
import {
  ORG_STATUS_LABELS,
  childrenMap,
  colorClasses,
  nodeTitle,
  type OrgNode,
  type OrgScenarioStatus,
} from "@/lib/org/model";
import { OrgCardView, parseCardKey } from "./OrgCards";
import { OrgModeBar } from "./OrgModeBar";
import { OrgNodeModal, type NodeFormResult } from "./OrgNodeModal";
import { PeerTags, cardFocusLabel, peerColor, peersOnNode } from "./OrgPresence";
import { OrgDiffPanel } from "./OrgPlanBoard";
import { useOrgPlan, type OrgPlan } from "./useOrgPlan";

const KIND_CHIP: Record<string, string> = {
  position: "роль",
  team: "бригада",
  external: "подрядчик",
  subsection: "подсекция",
  section: "секция",
};

type NodeModalState = { open: boolean; node: OrgNode | null; parentId: string | null; seq: number };

/** Вкладка «Схема компании»: иерархия по Высоцкому (блоки → секции → подсекции → люди). */
export function OrgSchemaView({
  supabase,
  canPlan,
  isAdmin,
}: {
  supabase: ReturnType<typeof createClient>;
  canPlan: boolean;
  isAdmin: boolean;
}) {
  const plan = useOrgPlan(supabase, canPlan, "schema");

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-bold">
          Схема компании <span className="text-sm font-normal text-stone-400">Schéma de l&apos;entreprise</span>
        </p>
        <button type="button" className="btn btn-secondary text-xs px-2.5 py-1.5" onClick={() => window.print()}>
          <Printer size={13} />
          Печать / PDF
        </button>
      </div>
      <OrgModeBar plan={plan} allowLocal={false} />

      {plan.schemaReady === false ? (
        !plan.canPlan && <EmptyState title="Схема ещё не опубликована" titleRu="Схема ещё не опубликована" />
      ) : plan.loading && plan.schemaReady === null ? (
        <div className="card">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : plan.mode === "now" && !plan.published ? (
        <div className="card text-center text-sm text-stone-500">
          Схема компании ещё не опубликована.
          {plan.canPlan && " Создайте сценарий в режиме «План», согласуйте его с Владимиром и опубликуйте."}
        </div>
      ) : plan.mode === "plan" && plan.canPlan && !plan.selectedScenario ? (
        <div className="card text-center text-sm text-stone-500">
          Выберите сценарий выше или создайте новый кнопкой «Новый сценарий».
        </div>
      ) : plan.loading ? (
        <div className="card">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
        <div className="org-print-area">
          <p className="mb-2 hidden text-sm font-bold print:block">
            {plan.activeScenario?.title ?? "Схема компании"} — {new Date().toLocaleDateString("fr-FR")}
          </p>
          <OrgTreeBoard plan={plan} />
        </div>
      )}

      {plan.mode === "plan" && plan.selectedScenario && plan.canPlan && <OrgWorkflowPanel plan={plan} isAdmin={isAdmin} />}
      <OrgDiffPanel plan={plan} />
      {plan.canPlan && plan.schemaReady && <OrgHistory plan={plan} isAdmin={isAdmin} />}
    </div>
  );
}

function OrgTreeBoard({ plan }: { plan: OrgPlan }) {
  const { nodes, resolved, canEdit } = plan;
  const kids = useMemo(() => childrenMap(nodes), [nodes]);
  const roots = kids.get(null) ?? [];
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [vacancyFor, setVacancyFor] = useState<string | null>(null);
  const [vacancyText, setVacancyText] = useState("");
  const [modal, setModal] = useState<NodeModalState>({ open: false, node: null, parentId: null, seq: 0 });

  const chefIds = useMemo(
    () => new Set(plan.teams.map((t) => t.chef_employee_id).filter((x): x is string => !!x)),
    [plan.teams]
  );

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate(parentId: string | null) {
    const parent = nodes.find((n) => n.id === parentId);
    plan.setFocus({ id: parentId, label: parent ? `добавляет в «${nodeTitle(parent).fr}»` : "добавляет блок" });
    setModal((m) => ({ open: true, node: null, parentId, seq: m.seq + 1 }));
  }
  function openEdit(node: OrgNode) {
    plan.setFocus({ id: node.id, label: `правит «${nodeTitle(node).fr}»` });
    setModal((m) => ({ open: true, node, parentId: node.parent_id, seq: m.seq + 1 }));
  }

  async function saveModal(r: NodeFormResult) {
    const { parentId, kind, ...patch } = r;
    if (modal.node) {
      const node = modal.node;
      await plan.batch(async () => {
        await plan.updateNode(node.id, { kind, ...patch });
        if (parentId !== node.parent_id) await plan.moveNode(node.id, parentId);
      });
    } else {
      await plan.addNode(parentId, kind, patch);
    }
    closeModal();
  }

  function closeModal() {
    plan.setFocus(null);
    setModal((m) => ({ ...m, open: false }));
  }

  function dropOn(nodeId: string | null) {
    const nKey = dragNode;
    const cKey = dragKey;
    setDragNode(null);
    setDragKey(null);
    setOverId(null);
    if (!canEdit) return;
    if (nKey) {
      plan.moveNode(nKey, nodeId);
      return;
    }
    if (!cKey) return;
    const parsed = parseCardKey(cKey);
    if (!parsed) return;
    if (parsed.kind === "employee") plan.placeEmployee(parsed.id, nodeId);
    else if (parsed.kind === "candidate") plan.placeCandidate(parsed.id, nodeId);
    else if (nodeId) {
      const card = [...resolved.byNode.values()].flat().find((c) => c.key === cKey);
      if (card?.placementId) plan.moveVacancy(card.placementId, nodeId);
    }
  }

  function renderNode(node: OrgNode, depth: number, rootColor: string | null, siblingsCount: number, index: number) {
    const t = nodeTitle(node);
    const cc = colorClasses(node.color ?? rootColor);
    const children = kids.get(node.id) ?? [];
    const cards = resolved.byNode.get(node.id) ?? [];
    const isCollapsed = collapsed.has(node.id);
    const isRoot = depth === 0;
    const editors = peersOnNode(plan, node.id);
    return (
      <div
        key={node.id}
        onDragOver={(ev) => {
          if (!canEdit) return;
          ev.preventDefault();
          ev.stopPropagation();
          setOverId(node.id);
        }}
        onDragLeave={() => setOverId((cur) => (cur === node.id ? null : cur))}
        onDrop={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          dropOn(node.id);
        }}
        style={editors.length ? { boxShadow: `0 0 0 3px ${peerColor(editors[0].email)}` } : undefined}
        className={`rounded-xl border-2 bg-white transition-colors ${cc.border} ${overId === node.id ? "ring-2 ring-violet-400" : ""}`}
      >
        <div
          draggable={canEdit}
          onDragStart={(ev) => {
            ev.stopPropagation();
            setDragNode(node.id);
            plan.setFocus({ id: node.id, label: `двигает «${t.fr}»` });
          }}
          onDragEnd={() => {
            setDragNode(null);
            setOverId(null);
            plan.setFocus(null);
          }}
          className={`rounded-t-[10px] px-2 py-1.5 ${isRoot ? cc.header : `${cc.soft} text-stone-800`} ${
            canEdit ? "cursor-grab active:cursor-grabbing" : ""
          }`}
        >
          <div className="flex items-start gap-1">
            {canEdit && <GripVertical size={13} className="mt-0.5 shrink-0 opacity-50" />}
            {children.length > 0 && (
              <button type="button" onClick={() => toggle(node.id)} className="mt-0.5 shrink-0 opacity-70 hover:opacity-100">
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className={`break-words text-xs font-bold leading-tight ${isRoot ? "uppercase tracking-wide" : ""}`}>{t.fr}</p>
              {t.ru && t.ru !== t.fr && <p className="break-words text-[0.65rem] leading-tight opacity-70">{t.ru}</p>}
            </div>
            {KIND_CHIP[node.kind] && (
              <span className="shrink-0 rounded bg-black/10 px-1 text-[0.55rem] uppercase">{KIND_CHIP[node.kind]}</span>
            )}
          </div>
          {canEdit && (
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <button type="button" title="Добавить внутрь" onClick={() => openCreate(node.id)} className="opacity-60 hover:opacity-100">
                <Plus size={13} />
              </button>
              <button type="button" title="Править" onClick={() => openEdit(node)} className="opacity-60 hover:opacity-100">
                <Pencil size={12} />
              </button>
              <button
                type="button"
                title={isRoot ? "Левее" : "Выше"}
                disabled={index === 0}
                onClick={() => plan.shiftNode(node.id, -1)}
                className="opacity-60 hover:opacity-100 disabled:opacity-20"
              >
                {isRoot ? <ArrowLeft size={12} /> : <ArrowUp size={12} />}
              </button>
              <button
                type="button"
                title={isRoot ? "Правее" : "Ниже"}
                disabled={index === siblingsCount - 1}
                onClick={() => plan.shiftNode(node.id, 1)}
                className="opacity-60 hover:opacity-100 disabled:opacity-20"
              >
                {isRoot ? <ArrowRight size={12} /> : <ArrowDown size={12} />}
              </button>
              <button
                type="button"
                title="Удалить"
                onClick={() => {
                  if (window.confirm("Удалить узел вместе со всеми вложенными?")) plan.deleteNode(node.id);
                }}
                className="opacity-60 hover:text-error-600 hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        <PeerTags peers={editors} />
        <div className="space-y-1.5 p-2">
          {(node.description || node.ckp || node.contact) && (
            <div className="space-y-0.5 text-[0.65rem] leading-snug text-stone-500">
              {node.description && <p>{node.description}</p>}
              {node.ckp && (
                <p>
                  <b className="text-stone-600">ЦКП:</b> {node.ckp}
                </p>
              )}
              {node.contact && (
                <p>
                  <b className="text-stone-600">Контакт:</b> {node.contact}
                </p>
              )}
            </div>
          )}
          {cards.map((card) => (
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
                setOverId(null);
                plan.setFocus(null);
              }}
              onRemove={card.kind === "vacancy" && canEdit ? () => plan.removeVacancy(card.placementId!) : undefined}
            />
          ))}
          {canEdit &&
            (vacancyFor === node.id ? (
              <input
                autoFocus
                className="input text-xs"
                placeholder="Название вакансии"
                value={vacancyText}
                onChange={(e) => setVacancyText(e.target.value)}
                onBlur={() => {
                  if (vacancyText.trim()) plan.addVacancy(node.id, vacancyText);
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
                onClick={() => setVacancyFor(node.id)}
                className="flex items-center gap-1 text-[0.65rem] text-stone-400 hover:text-error-500"
              >
                <Plus size={10} /> вакансия
              </button>
            ))}
          {!isCollapsed &&
            children.map((c, i) => renderNode(c, depth + 1, node.color ?? rootColor, children.length, i))}
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="card text-center text-sm text-stone-500">
        В сценарии пока нет структуры.
        {canEdit && (
          <div className="mt-3">
            <button className="btn btn-primary" onClick={() => openCreate(null)}>
              <Plus size={14} /> Добавить первый блок
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-x-auto">
        <div className="mx-auto mb-0 w-fit rounded-lg bg-stone-800 px-5 py-1.5 text-xs font-bold tracking-wide text-white">VLADIS</div>
        <div className="mx-auto h-3 w-px bg-stone-300" />
        <div className="flex min-w-max items-start justify-center">
          {roots.map((r, i) => (
            <div
              key={r.id}
              className="relative flex w-64 shrink-0 flex-col px-1.5 pt-4 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-stone-300 after:absolute after:left-1/2 after:top-0 after:h-4 after:w-px after:bg-stone-300"
            >
              {renderNode(r, 0, r.color, roots.length, i)}
            </div>
          ))}
        </div>
        {canEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn btn-secondary text-xs px-2.5 py-1.5" onClick={() => openCreate(null)}>
              <Plus size={13} /> Блок верхнего уровня
            </button>
            {dragNode && (
              <div
                onDragOver={(ev) => {
                  ev.preventDefault();
                  setOverId("__root__");
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  dropOn(null);
                }}
                className={`rounded-lg border-2 border-dashed px-4 py-2 text-xs ${
                  overId === "__root__" ? "border-violet-400 bg-violet-50" : "border-stone-300 text-stone-400"
                }`}
              >
                Перетащите сюда, чтобы сделать блоком верхнего уровня
              </div>
            )}
          </div>
        )}
      </div>

      {(resolved.unplacedEmployees.length > 0 || resolved.unplacedCandidates.length > 0) && (
        <div
          onDragOver={(ev) => {
            if (!canEdit) return;
            ev.preventDefault();
          }}
          onDrop={(ev) => {
            ev.preventDefault();
            if (!dragNode) dropOn(null);
          }}
          className="mt-4 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/70 p-3"
        >
          <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wide text-primary-600">
            Не размещены в схеме ({resolved.unplacedEmployees.length + resolved.unplacedCandidates.length})
            {canEdit && " — перетащите на нужный узел"}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {[...resolved.unplacedEmployees, ...resolved.unplacedCandidates].map((card) => (
              <OrgCardView
                key={card.key}
                card={card}
                chefIds={chefIds}
                canDrag={canEdit}
                onDragStart={() => {
                  setDragKey(card.key);
                  plan.setFocus({ id: null, label: cardFocusLabel(card) });
                }}
                onDragEnd={() => {
                  setDragKey(null);
                  setOverId(null);
                  plan.setFocus(null);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <OrgNodeModal
        key={modal.seq}
        open={modal.open}
        onClose={closeModal}
        node={modal.node}
        parentId={modal.parentId}
        nodes={nodes}
        teams={plan.teams}
        onSave={saveModal}
        onDelete={
          modal.node
            ? () => {
                plan.deleteNode(modal.node!.id);
                closeModal();
              }
            : undefined
        }
      />
    </>
  );
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
}

/** Кнопки перехода по статусам: черновик → согласование → утверждён → опубликован. */
function OrgWorkflowPanel({ plan, isAdmin }: { plan: OrgPlan; isAdmin: boolean }) {
  const sc = plan.selectedScenario!;
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(sc.title);

  const actions: { label: string; to: OrgScenarioStatus; adminOnly?: boolean; confirm?: string; primary?: boolean }[] = [];
  if (sc.status === "draft") actions.push({ label: "Отправить на согласование", to: "review", primary: true });
  if (sc.status === "review") {
    actions.push({ label: "Утвердить", to: "approved", adminOnly: true, primary: true });
    actions.push({ label: "Вернуть в черновик", to: "draft" });
  }
  if (sc.status === "approved") {
    actions.push({
      label: "Опубликовать",
      to: "published",
      adminOnly: true,
      primary: true,
      confirm: "Опубликовать схему? Прежняя опубликованная схема уйдёт в архив, новую увидят все, у кого есть доступ.",
    });
    actions.push({ label: "Вернуть в черновик", to: "draft", adminOnly: true });
  }
  if (sc.status === "published") {
    actions.push({ label: "Снять с публикации (в архив)", to: "archived", adminOnly: true, confirm: "Снять схему с публикации?" });
  }

  async function copy() {
    await plan.createScenario(`${sc.title} (копия)`, { type: "copy", scenarioId: sc.id });
  }

  return (
    <div className="card mt-4">
      <div className="flex flex-wrap items-center gap-3">
        {renaming ? (
          <input
            autoFocus
            className="input w-64 normal-case"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              if (title.trim() && title !== sc.title) plan.renameScenario(sc.id, title.trim());
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button
            type="button"
            className="font-bold hover:underline"
            title="Переименовать"
            onClick={() => {
              setTitle(sc.title);
              setRenaming(sc.status === "draft");
            }}
          >
            {sc.title}
          </button>
        )}
        <span className={`badge ${ORG_STATUS_LABELS[sc.status].badge}`}>{ORG_STATUS_LABELS[sc.status].ru}</span>
        <span className="text-xs text-stone-400">
          {sc.approved_at && `утверждён ${fmt(sc.approved_at)}${sc.approved_by_email ? ` (${sc.approved_by_email})` : ""}`}
          {sc.published_at && ` · опубликован ${fmt(sc.published_at)}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {actions
            .filter((a) => !a.adminOnly || isAdmin)
            .map((a) => (
              <button
                key={a.to + a.label}
                className={`btn ${a.primary ? "btn-primary" : "btn-secondary"} text-xs px-3 py-1.5`}
                onClick={async () => {
                  if (a.confirm && !window.confirm(a.confirm)) return;
                  await plan.setStatus(sc.id, a.to);
                }}
              >
                {a.label}
              </button>
            ))}
          {(sc.status === "published" || sc.status === "archived" || sc.status === "approved") && (
            <button className="btn btn-secondary text-xs px-3 py-1.5" onClick={copy}>
              Копия в новый черновик
            </button>
          )}
        </div>
      </div>
      {sc.status === "review" && !isAdmin && (
        <p className="mt-2 text-xs text-stone-400">Схема на согласовании: правки закрыты. Утвердить может только администратор.</p>
      )}
    </div>
  );
}

/** История версий: все сценарии, открыть любой. */
function OrgHistory({ plan, isAdmin }: { plan: OrgPlan; isAdmin: boolean }) {
  if (plan.scenarios.length === 0) return null;
  return (
    <div className="card mt-4 overflow-x-auto">
      <p className="mb-2 font-bold">Версии и сценарии</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-400">
            <th className="py-1 pr-3">Название</th>
            <th className="py-1 pr-3">Статус</th>
            <th className="py-1 pr-3">Создан</th>
            <th className="py-1 pr-3">Утверждён</th>
            <th className="py-1 pr-3">Опубликован</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {plan.scenarios.map((s) => (
            <tr key={s.id} className={s.id === plan.selectedScenario?.id ? "bg-violet-50" : ""}>
              <td className="py-1 pr-3 font-medium">{s.title}</td>
              <td className="py-1 pr-3">
                <span className={`badge ${ORG_STATUS_LABELS[s.status].badge}`}>{ORG_STATUS_LABELS[s.status].ru}</span>
              </td>
              <td className="py-1 pr-3">{fmt(s.created_at)}</td>
              <td className="py-1 pr-3">{fmt(s.approved_at)}</td>
              <td className="py-1 pr-3">{fmt(s.published_at)}</td>
              <td className="py-1 text-right">
                <button
                  className="btn btn-secondary text-xs px-2 py-1"
                  onClick={() => {
                    plan.chooseMode("plan");
                    plan.chooseScenario(s.id);
                  }}
                >
                  Открыть
                </button>
                {(s.status === "draft" || (isAdmin && (s.status === "archived" || s.status === "approved"))) && (
                  <button
                    className="ml-1 btn btn-secondary px-2 py-1 text-error-600"
                    title="Удалить сценарий"
                    onClick={() => {
                      if (window.confirm(`Удалить сценарий «${s.title}»? Это не затронет реальные данные.`)) plan.deleteScenario(s.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
