"use client";

import { useState } from "react";
import { PROPERTY_STATUS_LABEL, num, type VProperty } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { LeaseModal, LotModal } from "../forms";
import SitePlan from "../SitePlan";
import { Bi, Empty, Status, eur } from "../ui";

export default function Lots({ supabase, data }: { supabase: Supabase; data: VoldisData }) {
  const { props, leases, tenants, docs, reload } = data;
  const [editing, setEditing] = useState<VProperty | null | "new">(null);
  const [renting, setRenting] = useState<string | null>(null);
  const leaseBy = new Map(leases.filter((l) => l.is_active).map((l) => [l.property_id, l]));
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
  const occupied = (p: VProperty) => leaseBy.has(p.id) || !!p.occupant;
  const totalSurface = props.reduce((s, p) => s + num(p.surface_m2), 0);
  const rentedSurface = props.filter(occupied).reduce((s, p) => s + num(p.surface_m2), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          {props.filter(occupied).length} lots occupés sur {props.length} · <strong className="text-stone-800">{totalSurface ? Math.round((rentedSurface / totalSurface) * 100) : 0} %</strong> de la surface ({rentedSurface} / {totalSurface} m²)
        </p>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Bi fr="+ Lot" ru="+ Помещение" />
        </button>
      </div>
      <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
        <SitePlan props={props} leases={leases} tenants={tenants} onSelect={(p) => setEditing(p)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {props.map((p) => {
          const l = leaseBy.get(p.id);
          const st = l || p.occupant ? "rented" : p.status === "rented" ? "available" : p.status;
          return (
            <div key={p.id} className={`rounded-2xl border bg-white p-4 ${l || p.occupant ? "border-stone-200" : "border-dashed border-stone-300"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xl font-extrabold tracking-tight text-stone-900">Lot {p.lot_number}</div>
                  <div className="text-xs text-stone-400">{p.kind} · {num(p.surface_m2)} m²</div>
                </div>
                <Status tone={l || p.occupant ? "good" : st === "available" ? "idle" : "warn"}>{PROPERTY_STATUS_LABEL[st].fr}</Status>
              </div>
              <div className="mt-3 min-h-10 text-sm">
                {l ? (
                  <>
                    <div className="font-semibold text-stone-800">{tenantName.get(l.tenant_id)}</div>
                    <div className="tabular-nums text-stone-500">{eur(num(l.monthly_total))} / mois</div>
                  </>
                ) : p.occupant ? (
                  <>
                    <div className="font-semibold text-stone-800">{p.occupant}</div>
                    <div className="text-stone-500">{p.pays_cash ? "paie en espèces" : "sans bail enregistré"}</div>
                  </>
                ) : (
                  <div className="text-stone-400">Libre{p.list_rent ? ` · ${eur(num(p.list_rent))} / mois` : ""}</div>
                )}
              </div>
              <div className="mt-3 flex gap-3 text-sm font-semibold">
                <button className="text-primary-700 hover:underline" onClick={() => setEditing(p)}>Modifier</button>
                {!l && (
                  <button className="text-primary-700 hover:underline" onClick={() => setRenting(p.id)}>
                    Louer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {props.length === 0 && <Empty>Aucun lot.</Empty>}
      {editing && <LotModal supabase={supabase} lot={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
      {renting && <LeaseModal supabase={supabase} lease={null} props={props} tenants={tenants} leases={leases} docs={docs} defaultPropertyId={renting} onClose={() => setRenting(null)} onSaved={() => void reload()} />}
    </div>
  );
}
