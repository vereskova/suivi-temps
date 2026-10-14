"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import {
  BUREAU_ROLE_LABELS,
  BUREAU_ROLE_LABELS_RU,
  BUREAU_ROLE_ORDER,
  ORG_COLORS,
  ORG_COLOR_CLASSES,
  ORG_NODE_KIND_LABELS,
  descendantIds,
  nodeTitle,
  teamLabelRu,
  treeOrder,
  type OrgNode,
  type OrgNodeKind,
  type OrgTeamLite,
} from "@/lib/org/model";

export type NodeFormResult = {
  parentId: string | null;
  kind: OrgNodeKind;
  title_fr: string;
  title_ru: string;
  color: string | null;
  role_key: string | null;
  team_id: string | null;
  description: string | null;
  ckp: string | null;
  contact: string | null;
  notes: string | null;
};

/** Создание или правка узла схемы. `node = null` — создание под `parentId`. */
export function OrgNodeModal({
  open,
  onClose,
  node,
  parentId,
  nodes,
  teams,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  node: OrgNode | null;
  parentId: string | null;
  nodes: OrgNode[];
  teams: OrgTeamLite[];
  onSave: (r: NodeFormResult) => void;
  onDelete?: () => void;
}) {
  // Состояние инициализируется при монтировании; родитель ремонтирует форму через key.
  const [kind, setKind] = useState<OrgNodeKind>(node?.kind ?? (parentId ? "section" : "block"));
  const [titleFr, setTitleFr] = useState(node?.title_fr ?? "");
  const [titleRu, setTitleRu] = useState(node?.title_ru ?? "");
  const [color, setColor] = useState<string | null>(node?.color ?? null);
  const [roleKey, setRoleKey] = useState(node?.role_key ?? "");
  const [teamId, setTeamId] = useState(node?.team_id ?? "");
  const [description, setDescription] = useState(node?.description ?? "");
  const [ckp, setCkp] = useState(node?.ckp ?? "");
  const [contact, setContact] = useState(node?.contact ?? "");
  const [notes, setNotes] = useState(node?.notes ?? "");
  const [parent, setParent] = useState<string>(node ? node.parent_id ?? "" : parentId ?? "");

  const blocked = node ? descendantIds(nodes, node.id) : new Set<string>();
  const parentOptions = treeOrder(nodes).filter(({ node: n }) => n.id !== node?.id && !blocked.has(n.id));

  function pickRole(role: string) {
    setRoleKey(role);
    if (role) {
      if (!titleFr) setTitleFr(BUREAU_ROLE_LABELS[role]);
      if (!titleRu) setTitleRu(BUREAU_ROLE_LABELS_RU[role]);
    }
  }
  function pickTeam(id: string) {
    setTeamId(id);
    const t = teams.find((x) => x.id === id);
    if (t) {
      if (!titleFr) setTitleFr(t.name);
      if (!titleRu) setTitleRu(teamLabelRu(t.name));
    }
  }

  const valid = (titleFr.trim() || titleRu.trim()) && (kind !== "position" || roleKey) && (kind !== "team" || teamId);

  return (
    <Modal open={open} onClose={onClose} title={node ? "Правка узла" : "Новый узел"} maxWidth="max-w-xl">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Тип
            <select className="input mt-1 normal-case" value={kind} onChange={(e) => setKind(e.target.value as OrgNodeKind)}>
              {(Object.keys(ORG_NODE_KIND_LABELS) as OrgNodeKind[]).map((k) => (
                <option key={k} value={k}>
                  {ORG_NODE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Подчиняется (родитель)
            <select className="input mt-1 normal-case" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">— верхний уровень —</option>
              {parentOptions.map(({ node: n, depth }) => (
                <option key={n.id} value={n.id}>
                  {"— ".repeat(depth)}
                  {nodeTitle(n).ru || nodeTitle(n).fr}
                </option>
              ))}
            </select>
          </label>
        </div>

        {kind === "position" && (
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Роль офиса (люди подтягиваются из карточек)
            <select className="input mt-1 normal-case" value={roleKey} onChange={(e) => pickRole(e.target.value)}>
              <option value="">—</option>
              {BUREAU_ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {BUREAU_ROLE_LABELS_RU[r]} / {BUREAU_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "team" && (
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Бригада (состав подтягивается из карточек)
            <select className="input mt-1 normal-case" value={teamId} onChange={(e) => pickTeam(e.target.value)}>
              <option value="">—</option>
              {[...teams]
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Название (FR)
            <input className="input mt-1 normal-case" value={titleFr} onChange={(e) => setTitleFr(e.target.value)} />
          </label>
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Название (RU)
            <input className="input mt-1 normal-case" value={titleRu} onChange={(e) => setTitleRu(e.target.value)} />
          </label>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase text-stone-400">Цвет блока</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {ORG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${ORG_COLOR_CLASSES[c].header.split(" ")[0]} ${
                  color === c ? "border-stone-900" : "border-transparent"
                }`}
                title={c}
              />
            ))}
            <button type="button" onClick={() => setColor(null)} className="text-xs text-stone-400 underline">
              по умолчанию
            </button>
          </div>
        </div>

        <label className="block text-[10px] font-bold uppercase text-stone-400">
          Что делает блок (функция)
          <textarea className="input mt-1 normal-case" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block text-[10px] font-bold uppercase text-stone-400">
          ЦКП (ценный конечный продукт)
          <textarea className="input mt-1 normal-case" rows={2} value={ckp} onChange={(e) => setCkp(e.target.value)} />
        </label>
        {kind === "external" && (
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Контакт подрядчика
            <input className="input mt-1 normal-case" value={contact} onChange={(e) => setContact(e.target.value)} />
          </label>
        )}
        <label className="block text-[10px] font-bold uppercase text-stone-400">
          Заметки
          <textarea className="input mt-1 normal-case" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <div className="flex items-center justify-between gap-2 pt-1">
          {node && onDelete ? (
            <button
              className="btn btn-secondary text-error-600"
              onClick={() => {
                if (window.confirm("Удалить узел вместе со всеми вложенными? Люди вернутся на места по реальным карточкам.")) onDelete();
              }}
            >
              Удалить
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button
              className="btn btn-primary"
              disabled={!valid}
              onClick={() =>
                onSave({
                  parentId: parent || null,
                  kind,
                  title_fr: titleFr.trim(),
                  title_ru: titleRu.trim(),
                  color,
                  role_key: kind === "position" ? roleKey || null : null,
                  team_id: kind === "team" ? teamId || null : null,
                  description: description.trim() || null,
                  ckp: ckp.trim() || null,
                  contact: contact.trim() || null,
                  notes: notes.trim() || null,
                })
              }
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
