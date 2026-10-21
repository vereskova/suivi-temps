"use client";

import { num, type VLease, type VProperty, type VTenant } from "@/lib/voldis/rental";

/**
 * Plan du site (590 chemin d'Engoudes), redessiné d'après le croquis de la gestionnaire :
 *  - bâtiment A (en haut à gauche) : lots 1 à 5 en rangée, du 1 (côté nord-est) au 5 (côté sud-ouest) ;
 *  - bâtiment B (au centre-droit) : lot 6 au nord, lot 7 au milieu (la croix), lots 8 et 9 sur le côté sud-ouest ;
 *  - conteneur K, isolé en bas à droite.
 * Les formes sont posées avec la même inclinaison que sur la photo ; les textes restent droits.
 */

type Pt = [number, number];
// vecteurs unitaires des deux bâtiments (inclinaison relevée sur le croquis)
const U: Pt = [-0.629, 0.778]; // vers le sud-ouest
const V: Pt = [0.778, 0.629]; // vers le sud-est

const rect = (c: Pt, aV: number, bU: number): Pt[] =>
  ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sv, su]) => [c[0] + sv * aV * V[0] + su * bU * U[0], c[1] + sv * aV * V[1] + su * bU * U[1]] as Pt);

const poly = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
const mid = (c: Pt, dV = 0, dU = 0): Pt => [c[0] + dV * V[0] + dU * U[0], c[1] + dV * V[1] + dU * U[1]];

type Shape = { lot: string; center: Pt; aV: number; bU: number };

// Bâtiment A : cinq cellules en file (pas de 75,5 le long de U)
const A_START: Pt = [330, 282];
const A_STEP: Pt = [-47.5, 58.75];
const SHAPES: Shape[] = [
  ...[1, 2, 3, 4, 5].map((n) => ({ lot: String(n), center: [A_START[0] + (n - 1) * A_STEP[0], A_START[1] + (n - 1) * A_STEP[1]] as Pt, aV: 56, bU: 38 })),
  { lot: "6", center: [470, 525], aV: 98, bU: 50 },
  { lot: "7", center: [402, 592], aV: 86, bU: 45 },
  { lot: "8", center: [322, 620], aV: 44, bU: 28 },
  { lot: "9", center: [392, 676], aV: 44, bU: 28 },
  { lot: "K", center: [505, 795], aV: 34, bU: 24 },
];

const eur0 = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export default function SitePlan({
  props,
  leases,
  tenants,
  onSelect,
}: {
  props: VProperty[];
  leases: VLease[];
  tenants: VTenant[];
  onSelect?: (lot: VProperty) => void;
}) {
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const leaseBy = new Map(leases.filter((l) => l.is_active).map((l) => [l.property_id, l]));
  const byLot = new Map(props.map((p) => [p.lot_number, p]));

  return (
    <svg viewBox="55 215 565 640" className="mx-auto h-auto w-full max-w-xl" role="img" aria-label="Plan du site">
      {SHAPES.map((s) => {
        const p = byLot.get(s.lot);
        const lease = p ? leaseBy.get(p.id) : undefined;
        const who = lease ? tenantName.get(lease.tenant_id) : p?.occupant ?? null;
        const occupied = !!lease || !!p?.occupant;
        const label = s.lot === "K" ? "K" : s.lot;
        const pts = rect(s.center, s.aV, s.bU);
        const small = s.aV < 60;
        return (
          <g
            key={s.lot}
            className={p && onSelect ? "cursor-pointer" : ""}
            onClick={() => p && onSelect?.(p)}
            role={p && onSelect ? "button" : undefined}
            aria-label={`Lot ${label}${who ? `, ${who}` : ", libre"}`}
          >
            <polygon
              points={poly(pts)}
              className={occupied ? "fill-white stroke-stone-700 hover:fill-stone-50" : "fill-stone-50 stroke-stone-300 hover:fill-stone-100"}
              strokeWidth={occupied ? 2 : 1.5}
              strokeDasharray={occupied ? undefined : "5 4"}
              strokeLinejoin="round"
            />
            <text x={s.center[0]} y={s.center[1] - (small ? 4 : 10)} textAnchor="middle" className="fill-stone-900" style={{ fontSize: small ? 24 : 32, fontWeight: 800 }}>
              {label}
            </text>
            <text x={s.center[0]} y={s.center[1] + (small ? 14 : 12)} textAnchor="middle" className={occupied ? "fill-stone-600" : "fill-stone-400"} style={{ fontSize: small ? 12 : 14, fontWeight: 600 }}>
              {(who ?? "libre").length > 13 ? `${(who ?? "libre").slice(0, 12)}…` : who ?? "libre"}
            </text>
            {p && occupied && !small && (
              <text x={s.center[0]} y={s.center[1] + 30} textAnchor="middle" className="fill-stone-400" style={{ fontSize: 13 }}>
                {lease ? eur0(num(lease.monthly_total)) : ""}
                {p.pays_cash ? " · espèces" : ""}
              </text>
            )}
            {p && small && p.pays_cash && (
              <text x={s.center[0]} y={s.center[1] + 28} textAnchor="middle" className="fill-amber-600" style={{ fontSize: 11, fontWeight: 700 }}>
                espèces
              </text>
            )}
          </g>
        );
      })}
      {/* repères */}
      <text x={mid(SHAPES[0].center, 70, -70)[0]} y={mid(SHAPES[0].center, 70, -70)[1]} className="fill-stone-300" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2 }} textAnchor="middle">
        BÂTIMENT A
      </text>
      <text x={560} y={470} className="fill-stone-300" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2 }} textAnchor="middle">
        BÂTIMENT B
      </text>
      <text x={505} y={842} className="fill-stone-300" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2 }} textAnchor="middle">
        CONTENEUR
      </text>
    </svg>
  );
}
