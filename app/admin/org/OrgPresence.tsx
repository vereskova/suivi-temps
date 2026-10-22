"use client";

import type { PlanCard } from "@/lib/org/model";
import type { OrgPeer, OrgPlan } from "./useOrgPlan";

const PEER_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2"];

/** Цвет человека стабилен по e-mail (как в «Премиях и бонусах»). */
export function peerColor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

export function peerName(email: string): string {
  return email.split("@")[0];
}

/** Подпись для присутствия при переносе карточки. */
export function cardFocusLabel(card: PlanCard): string {
  if (card.kind === "employee") return `переносит ${card.employee!.last_name} ${card.employee!.first_name}`.trim();
  if (card.kind === "candidate") return `переносит кандидата ${card.candidate!.full_name ?? card.candidate!.position_label}`;
  return `переносит вакансию «${card.label}»`;
}

/** Кто сейчас в сценарии и что делает (чипы, как в «Премиях и бонусах»). */
export function OrgPeersBar({ plan }: { plan: OrgPlan }) {
  if (plan.peers.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {plan.peers.map((p) => {
        const me = p.email === plan.myEmail;
        return (
          <span
            key={p.email}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
            style={{ backgroundColor: peerColor(p.email) }}
            title={`${p.email}${p.tab === "schema" ? " - во вкладке «Схема компании»" : p.tab === "organigramme" ? " - во вкладке «Оргструктура»" : ""}`}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {peerName(p.email)}
            {me ? " (вы)" : p.focus ? ` - ${p.focus.label}` : ""}
          </span>
        );
      })}
    </div>
  );
}

/** Другие пользователи, которые сейчас работают с этим узлом. */
export function peersOnNode(plan: OrgPlan, nodeId: string): OrgPeer[] {
  return plan.peers.filter((p) => p.email !== plan.myEmail && p.focus?.id === nodeId);
}

/** Цветные метки «✎ имя» на узле. */
export function PeerTags({ peers }: { peers: OrgPeer[] }) {
  if (peers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 px-2 pb-1">
      {peers.map((p) => (
        <span
          key={p.email}
          className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold text-white"
          style={{ backgroundColor: peerColor(p.email) }}
          title={p.focus?.label}
        >
          ✎ {peerName(p.email)}
        </span>
      ))}
    </div>
  );
}
