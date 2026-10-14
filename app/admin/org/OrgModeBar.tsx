"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Redo2, Save, Undo2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ORG_STATUS_LABELS } from "@/lib/org/model";
import { OrgPeersBar } from "./OrgPresence";
import type { OrgPlan, StartFrom } from "./useOrgPlan";

/** Переключатель «Сейчас / План» + выбор сценария. Общий для обеих вкладок. */
export function OrgModeBar({ plan, allowLocal }: { plan: OrgPlan; allowLocal: boolean }) {
  const [newOpen, setNewOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState<string>("visotsky");
  const [busy, setBusy] = useState(false);

  // Cmd/Ctrl+Z — отменить, Cmd/Ctrl+Shift+Z или Ctrl+Y — вернуть (не трогаем поля ввода).
  const { canEdit, undo, redo } = plan;
  useEffect(() => {
    if (!canEdit) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, undo, redo]);

  if (plan.schemaReady === false) {
    return plan.canPlan ? (
      <div className="mb-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
        Режим «План» и схема компании заработают после выполнения миграции <b>0108_org_scenarios.sql</b> в Supabase.
      </div>
    ) : null;
  }
  if (plan.schemaReady === null) return null;
  // Не-редактор без опубликованной схемы: переключать нечего.
  if (!plan.canPlan && !plan.published) return null;

  const sc = plan.selectedScenario;
  const visibleScenarios = plan.scenarios.filter((s) => plan.canPlan || s.status === "published");

  async function submitNew() {
    setBusy(true);
    const start: StartFrom =
      from === "flat" ? { type: "flat" } : from === "visotsky" ? { type: "visotsky" } : { type: "copy", scenarioId: from };
    const id = await plan.createScenario(title, start);
    setBusy(false);
    if (id) {
      setNewOpen(false);
      setTitle("");
    }
  }

  async function submitSave() {
    setBusy(true);
    const id = await plan.saveLocalAsScenario(title);
    setBusy(false);
    if (id) {
      setSaveOpen(false);
      setTitle("");
    }
  }

  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-stone-200 text-sm font-semibold">
          <button
            type="button"
            onClick={() => plan.chooseMode("now")}
            className={`px-4 py-2 ${plan.mode === "now" ? "bg-stone-800 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}
          >
            Сейчас
          </button>
          <button
            type="button"
            onClick={() => plan.chooseMode("plan")}
            className={`px-4 py-2 ${plan.mode === "plan" ? "bg-violet-600 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}
          >
            {plan.canPlan ? "План" : "Утверждённый план"}
          </button>
        </div>

        {plan.mode === "plan" && plan.canPlan && (
          <>
            <select
              className="input w-auto min-w-56 normal-case"
              value={sc?.id ?? ""}
              onChange={(e) => plan.chooseScenario(e.target.value || null)}
            >
              {allowLocal && <option value="">Быстрая прикидка (не сохраняется)</option>}
              {!allowLocal && !sc && <option value="">— выберите сценарий —</option>}
              {visibleScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {ORG_STATUS_LABELS[s.status].ru}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary text-xs px-2.5 py-1.5" onClick={() => setNewOpen(true)}>
              <Plus size={13} />
              Новый сценарий
            </button>
            {plan.isLocal && allowLocal && (
              <>
                <button className="btn btn-secondary text-xs px-2.5 py-1.5" onClick={() => setSaveOpen(true)}>
                  <Save size={13} />
                  Сохранить как сценарий
                </button>
                <button className="btn btn-secondary text-xs px-2.5 py-1.5" onClick={plan.resetLocal} title="Вернуть всех на текущие места">
                  <RefreshCw size={13} />
                  Сбросить к реальному
                </button>
              </>
            )}
            {plan.canEdit && (
              <span className="inline-flex gap-1">
                <button
                  className="btn btn-secondary text-xs px-2.5 py-1.5"
                  disabled={!plan.canUndo}
                  onClick={() => plan.undo()}
                  title="Отменить последнее действие (Cmd+Z)"
                >
                  <Undo2 size={13} />
                  Отменить
                </button>
                <button
                  className="btn btn-secondary text-xs px-2.5 py-1.5"
                  disabled={!plan.canRedo}
                  onClick={() => plan.redo()}
                  title="Вернуть отменённое (Cmd+Shift+Z)"
                >
                  <Redo2 size={13} />
                  Вернуть
                </button>
              </span>
            )}
            {sc && <span className={`badge ${ORG_STATUS_LABELS[sc.status].badge}`}>{ORG_STATUS_LABELS[sc.status].ru}</span>}
          </>
        )}
        {plan.mode === "plan" && !plan.canPlan && plan.published && (
          <span className="text-sm text-stone-500">{plan.published.title}</span>
        )}
      </div>

      <p className="mt-2 text-xs text-stone-400">
        {plan.mode === "now"
          ? "Реальный состав из карточек сотрудников."
          : plan.isLocal
            ? "Быстрая прикидка: изменения только на экране, в базу ничего не пишется. Реальные бригады и карточки сотрудников не меняются."
            : sc && sc.status !== "draft"
              ? "Сценарий закрыт для правок (не в статусе «Черновик»). Реальные данные не меняются."
              : "План не меняет реальные бригады, роли и зарплаты: хранятся только отличия от реальности."}
      </p>
      <OrgPeersBar plan={plan} />

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Новый сценарий" maxWidth="max-w-md">
        <div className="space-y-3">
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Название
            <input className="input mt-1 normal-case" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Напр. «Вариант Владимира»" />
          </label>
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Начать с
            <select className="input mt-1 normal-case" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="visotsky">Предложенная структура по Высоцкому</option>
              <option value="flat">Плоская схема как сейчас (Офис + Стройка)</option>
              {plan.scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  Копия: {s.title} ({ORG_STATUS_LABELS[s.status].ru})
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setNewOpen(false)}>
              Отмена
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={submitNew}>
              Создать
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Сохранить как сценарий" maxWidth="max-w-md">
        <div className="space-y-3">
          <label className="block text-[10px] font-bold uppercase text-stone-400">
            Название
            <input className="input mt-1 normal-case" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setSaveOpen(false)}>
              Отмена
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={submitSave}>
              Сохранить
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
