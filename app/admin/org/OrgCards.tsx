"use client";

import { Crown, X } from "lucide-react";
import type { PlanCard } from "@/lib/org/model";

const CANDIDATE_STATUS_RU: Record<string, string> = {
  considering: "На рассмотрении",
  interview: "Собеседование",
  offered: "Предложение сделано",
  confirmed: "Подтверждён",
};

function personLabel(e: { first_name: string; last_name: string; badge_emoji: string | null; can_substitute: boolean }) {
  const suffix = [e.badge_emoji, e.can_substitute ? "🔁" : null].filter(Boolean).join(" ");
  const name = `${e.last_name} ${e.first_name}`.trim();
  return suffix ? `${name} ${suffix}` : name;
}

/** Карточка в схеме: сотрудник, кандидат или вакансия. Перетаскивается только при canDrag. */
export function OrgCardView({
  card,
  chefIds,
  canDrag,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  card: PlanCard;
  /** Бригадиры (employee id) — для короны. */
  chefIds: Set<string>;
  canDrag: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Только для вакансий. */
  onRemove?: () => void;
}) {
  const drag = {
    draggable: canDrag && !card.attached,
    onDragStart: (ev: React.DragEvent) => {
      ev.stopPropagation();
      onDragStart?.();
    },
    onDragEnd: () => onDragEnd?.(),
  };
  const grab = canDrag && !card.attached ? "cursor-grab active:cursor-grabbing" : "";
  const movedRing = card.moved ? "ring-2 ring-violet-400" : "";

  if (card.kind === "employee") {
    const e = card.employee!;
    const isBoss = e.bureau_role === "boss";
    const isChef = chefIds.has(e.id);
    const tone = isBoss
      ? "bg-primary-600 border-primary-600 text-white"
      : isChef
        ? "bg-success-50 border-success-200 text-success-800"
        : e.category === "bureau"
          ? "bg-warning-50 border-warning-200 text-warning-800"
          : "bg-white border-stone-200 text-stone-800";
    return (
      <div
        {...drag}
        title={card.attached ? "Сотрудник офиса, прикреплённый к бригаде" : undefined}
        className={`flex min-w-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold leading-tight ${tone} ${grab} ${movedRing} ${
          card.attached ? "opacity-70" : ""
        }`}
      >
        {isChef && <Crown size={11} className="shrink-0 fill-current" />}
        <span className="truncate">{personLabel(e)}</span>
        {card.attached && <span className="shrink-0 text-[0.6rem] font-normal">↗</span>}
      </div>
    );
  }

  if (card.kind === "candidate") {
    const c = card.candidate!;
    return (
      <div
        {...drag}
        title={[c.position_label, CANDIDATE_STATUS_RU[c.status] ?? c.status].filter(Boolean).join(" · ")}
        className={`rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/50 px-2.5 py-2 text-xs ${grab} ${movedRing}`}
      >
        <p className="truncate font-bold text-primary-800">{c.full_name || "Кандидат"}</p>
        <p className="truncate text-[0.65rem] text-stone-500">{c.position_label}</p>
        <p className="truncate text-[0.6rem] text-primary-600">
          {CANDIDATE_STATUS_RU[c.status] ?? c.status}
          {c.team_label ? ` · бригада «${c.team_label}»` : ""}
        </p>
      </div>
    );
  }

  return (
    <div
      {...drag}
      className={`flex min-w-0 items-center gap-1 rounded-lg border-2 border-dashed border-error-300 bg-error-50 px-2.5 py-2 text-xs font-bold text-error-700 ${grab}`}
    >
      <span className="truncate">Вакансия: {card.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onRemove();
          }}
          className="ml-auto shrink-0 text-error-400 hover:text-error-700"
          title="Убрать вакансию"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/** Ключ перетаскиваемой карточки → тип и id. */
export function parseCardKey(key: string): { kind: "employee" | "candidate" | "vacancy"; id: string } | null {
  const m = /^([ecv]):([0-9a-f-]{36})/i.exec(key);
  if (!m) return null;
  return { kind: m[1] === "e" ? "employee" : m[1] === "c" ? "candidate" : "vacancy", id: m[2] };
}
