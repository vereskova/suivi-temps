"use client";

import { useCallback, useEffect, useState } from "react";
import type { createClient } from "@/lib/supabase/client";
import { missingCharges, type VBankTx, type VCharge, type VDocument, type VInvoice, type VLease, type VProperty, type VSettings, type VTenant } from "@/lib/voldis/rental";

export type Supabase = ReturnType<typeof createClient>;

export type VoldisData = {
  loading: boolean;
  missing: boolean;
  props: VProperty[];
  tenants: VTenant[];
  leases: VLease[];
  charges: VCharge[];
  txs: VBankTx[];
  invoices: VInvoice[];
  docs: VDocument[];
  settings: VSettings | null;
  reload: () => Promise<void>;
};

/** Charge toutes les tables VOLDIS (petit volume) et expose un `reload` après chaque modification. */
export function useVoldisData(supabase: Supabase): VoldisData {
  const [state, setState] = useState<Omit<VoldisData, "reload">>({
    loading: true,
    missing: false,
    props: [],
    tenants: [],
    leases: [],
    charges: [],
    txs: [],
    invoices: [],
    docs: [],
    settings: null,
  });

  const reload = useCallback(async () => {
    const [p, t, l, c, b, i, d, s] = await Promise.all([
      supabase.from("voldis_properties").select("*"),
      supabase.from("voldis_tenants").select("*").order("name"),
      supabase.from("voldis_leases").select("*").order("start_date", { ascending: false }),
      supabase.from("voldis_charges").select("*").order("due_date", { ascending: false }).limit(5000),
      supabase.from("voldis_bank_transactions").select("*").order("settled_at", { ascending: false }).limit(2000),
      supabase.from("voldis_invoices").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("voldis_documents").select("*").order("uploaded_at", { ascending: false }),
      supabase.from("voldis_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (p.error) {
      setState((prev) => ({ ...prev, loading: false, missing: true }));
      return;
    }
    // Платежи по договорам создаются автоматически: если договор действует, платёж за месяц ожидается.
    let charges = (c.data ?? []) as VCharge[];
    const leases = (l.data ?? []) as VLease[];
    const missing = missingCharges(leases, charges, new Date().toISOString().slice(0, 7));
    if (missing.length > 0) {
      const { data: created } = await supabase.from("voldis_charges").insert(missing).select("*");
      if (created) charges = [...(created as VCharge[]), ...charges].sort((a, z) => z.due_date.localeCompare(a.due_date));
    }
    // Таблицы из миграции 0118 могут отсутствовать: работаем и без них.
    setState({
      loading: false,
      missing: false,
      props: ((p.data ?? []) as VProperty[]).sort((a, z) => a.lot_number.localeCompare(z.lot_number, "fr", { numeric: true })),
      tenants: (t.data ?? []) as VTenant[],
      leases,
      charges,
      txs: (b.data ?? []) as VBankTx[],
      invoices: i.error ? [] : ((i.data ?? []) as VInvoice[]),
      docs: d.error ? [] : ((d.data ?? []) as VDocument[]),
      settings: s.error ? null : ((s.data as VSettings | null) ?? null),
    });
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { ...state, reload };
}
