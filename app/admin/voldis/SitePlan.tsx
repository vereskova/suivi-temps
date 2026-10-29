"use client";

import { num, type VLease, type VProperty, type VTenant } from "@/lib/voldis/rental";

/**
 * Plan du site (590 chemin d'Engoudes), redessiné d'après la photo aérienne découpée à la main :
 *  - bâtiment A (en haut à gauche) : A1 à A5, du côté nord-est (A1) au côté sud-ouest (A5, A4 = deux carrés au bout) ;
 *  - bâtiment B (au centre) : B1 (bande nord-est), B2 (grande partie centrale),
 *    puis la bande sud-ouest découpée en quatre cellules B3 à B6 (de l'extrémité ouest vers l'extrémité sud-est) ;
 *  - conteneur K, à droite du bâtiment B.
 * Les coordonnées sont celles de la photo ; les textes restent droits.
 */

type Pt = [number, number];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Bâtiment A : arêtes nord-ouest (N*) et sud-est (E*), coupées à 40 % et 70 % de la longueur, puis deux carrés au bout
const N0: Pt = [578, 66], N1: Pt = [338, 368], N2: Pt = [268, 490];
const E0: Pt = [710, 160], E1: Pt = [497, 478], E2: Pt = [418, 588];
const nwA = (t: number) => lerp(N0, N1, t);
const seA = (t: number) => lerp(E0, E1, t);
const SQ_TOP = lerp(N1, E1, 0.47);
const SQ_BOT = lerp(N2, E2, 0.5);

// Bâtiment B : quatre coins, bande nord-est (jusqu'à 38 %), grande partie (jusqu'à 80 %), bande sud-ouest en 4 cellules
const BN: Pt = [775, 358], BE: Pt = [985, 525], BS: Pt = [780, 780], BW: Pt = [580, 605];
const nwB = (t: number) => lerp(BN, BW, t);
const seB = (t: number) => lerp(BE, BS, t);
const stripIn = (s: number) => lerp(nwB(0.8), seB(0.8), s);
const stripOut = (s: number) => lerp(BW, BS, s);
const STRIP_CUTS = [0, 0.34, 0.61, 0.79, 1];
const stripCell = (k: number): Pt[] => [stripIn(STRIP_CUTS[k]), stripIn(STRIP_CUTS[k + 1]), stripOut(STRIP_CUTS[k + 1]), stripOut(STRIP_CUTS[k])];

type Shape = { lot: string; pts: Pt[]; small?: boolean; narrow?: boolean };

const SHAPES: Shape[] = [
  { lot: "A1", pts: [N0, E0, seA(0.4), nwA(0.4)] },
  { lot: "A2", pts: [nwA(0.4), seA(0.4), seA(0.7), nwA(0.7)] },
  { lot: "A3", pts: [nwA(0.7), seA(0.7), E1, N1] },
  { lot: "A4", pts: [N1, SQ_TOP, SQ_BOT, N2], narrow: true },
  { lot: "A5", pts: [SQ_TOP, E1, E2, SQ_BOT], narrow: true },
  { lot: "B1", pts: [BN, BE, seB(0.38), nwB(0.38)] },
  { lot: "B2", pts: [nwB(0.38), seB(0.38), seB(0.8), nwB(0.8)] },
  { lot: "B3", pts: stripCell(0), small: true },
  { lot: "B4", pts: stripCell(1), small: true },
  { lot: "B5", pts: stripCell(2), small: true },
  { lot: "B6", pts: stripCell(3), small: true },
  { lot: "K", pts: [[1163, 545], [1198, 526], [1229, 568], [1192, 598]], small: true },
];

const poly = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
const centroid = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

const eur0 = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export type LotState = "paid" | "expected" | "late" | "other" | "free";

const STATE_CLASS: Record<LotState, string> = {
  paid: "fill-emerald-50 stroke-emerald-600 hover:fill-emerald-100",
  expected: "fill-amber-50 stroke-amber-500 hover:fill-amber-100",
  late: "fill-red-50 stroke-red-500 hover:fill-red-100",
  other: "fill-white stroke-stone-500 hover:fill-stone-50",
  free: "fill-stone-50 stroke-stone-300 hover:fill-stone-100",
};

export const LOT_STATE_LEGEND: { state: LotState; label: string; dot: string }[] = [
  { state: "paid", label: "Оплачено", dot: "bg-emerald-500" },
  { state: "expected", label: "Ожидается", dot: "bg-amber-500" },
  { state: "late", label: "Просрочено", dot: "bg-red-500" },
  { state: "other", label: "Без договора", dot: "bg-stone-500" },
  { state: "free", label: "Свободно", dot: "bg-stone-300" },
];

export default function SitePlan({
  props,
  leases,
  tenants,
  states,
  onSelect,
}: {
  props: VProperty[];
  leases: VLease[];
  tenants: VTenant[];
  states?: Map<string, LotState>;
  onSelect?: (lot: VProperty) => void;
}) {
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const leaseBy = new Map(leases.filter((l) => l.is_active).map((l) => [l.property_id, l]));
  const byLot = new Map(props.map((p) => [p.lot_number, p]));

  return (
    <svg viewBox="245 45 1010 760" className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label="Plan du site">
      {SHAPES.map((s) => {
        const p = byLot.get(s.lot);
        const lease = p ? leaseBy.get(p.id) : undefined;
        const who = lease ? tenantName.get(lease.tenant_id) : p?.occupant ?? null;
        const occupied = !!lease || !!p?.occupant;
        const state: LotState = states?.get(s.lot) ?? (occupied ? "other" : "free");
        const [cx, cy] = centroid(s.pts);
        const small = !!s.small;
        const name = who ?? "свободно";
        return (
          <g
            key={s.lot}
            className={p && onSelect ? "cursor-pointer" : ""}
            onClick={() => p && onSelect?.(p)}
            role={p && onSelect ? "button" : undefined}
            aria-label={`Помещение ${s.lot}${who ? `, ${who}` : ", свободно"}`}
          >
            <polygon
              points={poly(s.pts)}
              className={STATE_CLASS[state]}
              strokeWidth={state === "free" ? 2 : 3}
              strokeDasharray={state === "free" ? "7 5" : undefined}
              strokeLinejoin="round"
            />
            <text x={cx} y={cy + (small ? 7 : -6)} textAnchor="middle" className="fill-stone-900" style={{ fontSize: small ? 22 : 34, fontWeight: 800 }}>
              {s.lot}
            </text>
            {!small && (
              <text x={cx} y={cy + 16} textAnchor="middle" className={occupied ? "fill-stone-600" : "fill-stone-400"} style={{ fontSize: 15, fontWeight: 600 }}>
                {name.length > (s.narrow ? 10 : 15) ? `${name.slice(0, s.narrow ? 9 : 14)}…` : name}
              </text>
            )}
            {p && occupied && !small && lease && (
              <text x={cx} y={cy + 36} textAnchor="middle" className="fill-stone-400" style={{ fontSize: 14 }}>
                {eur0(num(lease.monthly_total))}
                {p.pays_cash ? " · нал." : ""}
              </text>
            )}
            {p && small && p.pays_cash && (
              <text x={cx} y={cy + 26} textAnchor="middle" className="fill-amber-600" style={{ fontSize: 12, fontWeight: 700 }}>
                нал.
              </text>
            )}
          </g>
        );
      })}
      {/* repères */}
      <text x={470} y={100} className="fill-stone-300" style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3 }} textAnchor="middle">
        ЗДАНИЕ A
      </text>
      <text x={955} y={395} className="fill-stone-300" style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3 }} textAnchor="middle">
        ЗДАНИЕ B
      </text>
      <text x={1186} y={632} className="fill-stone-300" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2 }} textAnchor="middle">
        КОНТЕЙНЕР
      </text>
    </svg>
  );
}
