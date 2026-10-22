"use client";

import { toast } from "@/components/Toast";
import type { VInvoice } from "@/lib/voldis/rental";

/** Вызов серверного метода VOLDIS (счета, письма). */
export async function callApi<T = unknown>(url: string, body?: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function openPdf(invoiceId: string) {
  window.open(`/api/voldis/invoices/${invoiceId}/pdf`, "_blank", "noopener");
}

/** Создаёт (или находит уже созданный) счёт либо квитанцию по платежу. */
export async function ensureInvoice(chargeId: string, kind: "invoice" | "receipt"): Promise<VInvoice | null> {
  const { ok, data } = await callApi<{ invoice: VInvoice }>("/api/voldis/invoices", { chargeId, kind });
  if (!ok) {
    toast.error(data.error ?? "Ошибка");
    return null;
  }
  return data.invoice;
}

export async function sendInvoice(inv: VInvoice): Promise<boolean> {
  const { ok, data } = await callApi<{ to: string }>(`/api/voldis/invoices/${inv.id}/send`);
  if (!ok) {
    toast.error(data.error ?? "Не удалось отправить");
    return false;
  }
  toast.success(`Отправлено: ${data.to}`);
  return true;
}

export async function remindTenant(tenantId: string): Promise<boolean> {
  const { ok, data } = await callApi<{ to: string }>("/api/voldis/reminders", { tenantId });
  if (!ok) {
    toast.error(data.error ?? "Не удалось отправить напоминание");
    return false;
  }
  toast.success(`Напоминание отправлено: ${data.to}`);
  return true;
}

import type { Supabase } from "./data";

/** Обновление платежа; если поле paid_cash ещё не создано (миграция 0121), повторяем без него. */
export async function updateCharge(supabase: Supabase, id: string, patch: Record<string, unknown>): Promise<boolean> {
  let { error } = await supabase.from("voldis_charges").update(patch).eq("id", id);
  if (error && /paid_cash/.test(error.message)) {
    const { paid_cash, ...rest } = patch;
    void paid_cash;
    ({ error } = await supabase.from("voldis_charges").update(rest).eq("id", id));
  }
  if (error) {
    toast.error("Ошибка: " + error.message);
    return false;
  }
  return true;
}

/** Создание платежей (например, оплата вперёд); если поля paid_cash ещё нет (миграция 0121), повторяем без него. */
export async function insertCharges(supabase: Supabase, rows: Record<string, unknown>[]): Promise<boolean> {
  let { error } = await supabase.from("voldis_charges").insert(rows);
  if (error && /paid_cash/.test(error.message)) {
    ({ error } = await supabase.from("voldis_charges").insert(rows.map(({ paid_cash, ...rest }) => (void paid_cash, rest))));
  }
  if (error) {
    toast.error("Ошибка: " + error.message);
    return false;
  }
  return true;
}
