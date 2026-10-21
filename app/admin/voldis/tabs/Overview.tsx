"use client";

import { useMemo, useState } from "react";
import { toast } from "@/components/Toast";
import { proposeMatches } from "@/lib/voldis/matching";
import { num, remaining, round2 } from "@/lib/voldis/rental";
import type { Supabase, VoldisData } from "../data";
import { Bi, Section, eur, eur0, frDate, todayIso } from "../ui";
import { callApi } from "./Rents";

type Tab = "apercu" | "loyers" | "locataires" | "lots" | "baux" | "factures" | "banque" | "reglages";

type Item = { key: string; title: string; detail: string; tone: "bad" | "warn" | "idle"; actions: { label: string; onClick: () => void }[] };

export default function Overview({ data, go }: { supabase: Supabase; data: VoldisData; go: (t: Tab) => void }) {
  const { props, tenants, leases, charges, txs, docs, reload } = data;
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayIso();
  const month = today.slice(0, 7);
  const [in90] = useState(() => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const [in60] = useState(() => new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10));

  const tenantBy = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);
  const lotOf = useMemo(() => new Map(props.map((p) => [p.id, p.lot_number])), [props]);
  const activeLeases = leases.filter((l) => l.is_active);

  const monthCharges = charges.filter((c) => c.due_date.slice(0, 7) === month);
  const due = round2(monthCharges.reduce((s, c) => s + num(c.amount_due), 0));
  const paid = round2(monthCharges.reduce((s, c) => s + Math.min(num(c.amount_paid), num(c.amount_due)), 0));
  const pct = due > 0 ? Math.round((paid / due) * 100) : 0;
  const lateTotal = round2(charges.filter((c) => c.kind === "rent" && (c.status === "late" || c.status === "partial")).reduce((s, c) => s + remaining(c), 0));
  const rentPerMonth = round2(activeLeases.reduce((s, l) => s + num(l.monthly_total), 0));

  async function remind(tenantId: string, name: string, amount: number) {
    if (!window.confirm(`Envoyer un rappel de ${eur(amount)} à ${name} ?\nОтправить напоминание ${name}?`)) return;
    setBusy(tenantId);
    const { ok, data: r } = await callApi<{ to: string }>("/api/voldis/reminders", { tenantId });
    setBusy(null);
    if (!ok) return toast.error(r.error ?? "Erreur");
    toast.success(`Rappel envoyé à ${r.to} / Напоминание отправлено`);
    await reload();
  }

  const items: Item[] = [];

  // 1. Impayés par locataire
  const lateBy = new Map<string, { amount: number; n: number; since: string }>();
  charges
    .filter((c) => c.kind === "rent" && (c.status === "late" || c.status === "partial") && c.tenant_id)
    .forEach((c) => {
      const cur = lateBy.get(c.tenant_id!) ?? { amount: 0, n: 0, since: c.due_date };
      cur.amount = round2(cur.amount + remaining(c));
      cur.n++;
      if (c.due_date < cur.since) cur.since = c.due_date;
      lateBy.set(c.tenant_id!, cur);
    });
  lateBy.forEach((v, tenantId) => {
    const t = tenantBy.get(tenantId);
    if (!t || v.amount <= 0) return;
    items.push({
      key: `late-${tenantId}`,
      title: `${t.name} — ${eur(v.amount)} impayé`,
      detail: `${v.n} échéance${v.n > 1 ? "s" : ""}, la plus ancienne du ${frDate(v.since)}`,
      tone: "bad",
      actions: [
        { label: busy === tenantId ? "Envoi…" : "Envoyer un rappel", onClick: () => void remind(tenantId, t.name, v.amount) },
        { label: "Voir", onClick: () => go("loyers") },
      ],
    });
  });

  // 2. Paiements reçus à rapprocher
  const proposals = proposeMatches(txs, charges, tenants);
  if (proposals.length > 0) {
    const sureN = proposals.filter((p) => p.confidence === "sure").length;
    items.push({
      key: "bank",
      title: `${proposals.length} virement${proposals.length > 1 ? "s" : ""} reçu${proposals.length > 1 ? "s" : ""} à rapprocher`,
      detail: `${sureN} sûr${sureN > 1 ? "s" : ""}, ${proposals.length - sureN} à vérifier — ${proposals.slice(0, 3).map((p) => `${p.tenant.name} ${eur(num(p.tx.amount))}`).join(" · ")}`,
      tone: "warn",
      actions: [{ label: "Ouvrir la banque", onClick: () => go("banque") }],
    });
  }

  // 3. Baux qui se terminent
  activeLeases
    .filter((l) => l.end_date && l.end_date <= in90)
    .sort((a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? ""))
    .forEach((l) => {
      const over = l.end_date! < today;
      items.push({
        key: `end-${l.id}`,
        title: `Lot ${lotOf.get(l.property_id)} · ${tenantBy.get(l.tenant_id)?.name ?? ""} — bail ${over ? "expiré" : "se termine"} le ${frDate(l.end_date)}`,
        detail: over ? "À renouveler, résilier ou prolonger" : "Pensez au renouvellement ou au préavis",
        tone: over ? "bad" : "warn",
        actions: [{ label: "Ouvrir les baux", onClick: () => go("baux") }],
      });
    });

  // 4. Révisions de loyer
  activeLeases
    .filter((l) => l.index_type && l.index_type !== "none" && l.next_revision_date && l.next_revision_date <= in60)
    .forEach((l) => {
      items.push({
        key: `rev-${l.id}`,
        title: `Lot ${lotOf.get(l.property_id)} · ${tenantBy.get(l.tenant_id)?.name ?? ""} — révision ${l.index_type} au ${frDate(l.next_revision_date)}`,
        detail: "Calculez le nouveau loyer avec le dernier indice publié",
        tone: "idle",
        actions: [{ label: "Réviser", onClick: () => go("baux") }],
      });
    });

  // 5. Dossiers incomplets
  const noMail = tenants.filter((t) => t.is_active && activeLeases.some((l) => l.tenant_id === t.id) && !(t.email || t.billing_email));
  if (noMail.length > 0) {
    items.push({
      key: "nomail",
      title: `${noMail.length} locataire${noMail.length > 1 ? "s" : ""} sans e-mail`,
      detail: `${noMail.map((t) => t.name).join(", ")} — impossible d'envoyer les factures`,
      tone: "idle",
      actions: [{ label: "Compléter", onClick: () => go("locataires") }],
    });
  }
  const noContract = activeLeases.filter((l) => !docs.some((d) => d.lease_id === l.id && d.kind === "contract"));
  if (noContract.length > 0) {
    items.push({
      key: "nocontract",
      title: `${noContract.length} bail${noContract.length > 1 ? "s" : ""} sans contrat joint`,
      detail: noContract.map((l) => `Lot ${lotOf.get(l.property_id)}`).join(", "),
      tone: "idle",
      actions: [{ label: "Ajouter les contrats", onClick: () => go("baux") }],
    });
  }

  const dot = { bad: "bg-red-500", warn: "bg-amber-500", idle: "bg-stone-300" };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Loyers par mois" ru="Аренда в месяц" value={eur0(rentPerMonth)} sub={`${activeLeases.length} baux actifs`} />
        <Figure label="Ce mois-ci" ru="В этом месяце" value={due > 0 ? `${pct} %` : "—"} sub={due > 0 ? `${eur0(paid)} encaissés sur ${eur0(due)}` : "Aucune échéance créée"} bar={due > 0 ? pct : undefined} />
        <Figure label="Impayés" ru="Задолженность" value={lateTotal > 0 ? eur0(lateTotal) : "0 €"} sub={lateTotal > 0 ? `${lateBy.size} locataire${lateBy.size > 1 ? "s" : ""}` : "Tout est à jour"} tone={lateTotal > 0 ? "bad" : "good"} />
      </div>

      <Section title="À traiter" ru="Требует внимания">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-5 py-8 text-center text-sm text-stone-400">Tout est en ordre / Всё в порядке</div>
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dot[it.tone]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-stone-800">{it.title}</div>
                  <div className="text-xs text-stone-400">{it.detail}</div>
                </div>
                <div className="flex gap-2">
                  {it.actions.map((a, i) => (
                    <button key={a.label} className={`btn px-3 py-1.5 text-xs ${i === 0 ? "btn-secondary" : "text-stone-500 hover:text-stone-800"}`} onClick={a.onClick}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Lots" ru="Помещения" action={<button className="text-sm font-semibold text-primary-700 hover:underline" onClick={() => go("lots")}>Gérer</button>}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {props.map((p) => {
            const l = activeLeases.find((x) => x.property_id === p.id);
            return (
              <button
                key={p.id}
                onClick={() => go("lots")}
                title={l ? tenantBy.get(l.tenant_id)?.name : "Libre"}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-stone-400 ${l ? "border-stone-200 bg-white" : "border-dashed border-stone-300 bg-stone-50"}`}
              >
                <div className="text-base font-extrabold text-stone-900">{p.lot_number}</div>
                <div className="truncate text-[11px] text-stone-400">{l ? tenantBy.get(l.tenant_id)?.name : "libre"}</div>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Figure({ label, ru, value, sub, bar, tone }: { label: string; ru: string; value: string; sub: string; bar?: number; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
        <Bi fr={label} ru={ru} />
      </div>
      <div className={`mt-1.5 text-3xl font-extrabold tracking-tight tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-stone-900"}`}>{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${bar}%` }} />
        </div>
      )}
      <div className="mt-2 text-xs text-stone-400">{sub}</div>
    </div>
  );
}
