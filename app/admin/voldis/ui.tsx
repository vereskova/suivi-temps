"use client";

import { useEffect, useRef, useState } from "react";
import { num } from "@/lib/voldis/rental";

export const eur = (n: number) => `${num(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const eur0 = (n: number) => `${Math.round(num(n)).toLocaleString("fr-FR")} €`;
export const frDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "-");
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Подпись интерфейса: раздел VOLDIS целиком на русском (французский остаётся только в счетах и письмах). */
export function Bi({ fr, ru, className = "" }: { fr?: string; ru: string; className?: string }) {
  void fr;
  return <span className={className}>{ru}</span>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-8">
      <div className="fixed inset-0 bg-stone-900/40" onClick={onClose} />
      <div className={`relative z-10 w-full ${width} rounded-2xl bg-white p-5 shadow-xl sm:p-7`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-extrabold tracking-tight text-stone-900">{title}</h2>
          <button onClick={onClose} className="-mr-1 rounded-lg px-2 py-1 text-xl leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Закрыть">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, ru, hint, children, className = "" }: { label: string; ru?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-semibold text-stone-600">{ru ?? label}</span>
      {children}
      {hint && <span className="text-[11px] text-stone-400">{hint}</span>}
    </label>
  );
}

/** Pastille d'état : un point coloré + un mot, plus calme qu'un badge plein. */
export function Status({ tone, children }: { tone: "good" | "warn" | "bad" | "idle"; children: React.ReactNode }) {
  const dot = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", idle: "bg-stone-300" }[tone];
  const text = { good: "text-stone-700", warn: "text-amber-700", bad: "text-red-700", idle: "text-stone-400" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

/** Menu « ⋯ » pour les actions secondaires d'une ligne. */
export function Menu({ items }: { items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="rounded-lg px-2 py-1 text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Действия">
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          {shown.map((it) => (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`block w-full px-3.5 py-2 text-left text-sm hover:bg-stone-50 disabled:opacity-40 ${it.danger ? "text-red-600" : "text-stone-700"}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-12 text-center text-sm text-stone-400">{children}</div>;
}

export function Section({ title, ru, action, children }: { title: string; ru?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">
          {title}
          {ru && <span className="ml-2 font-medium normal-case tracking-normal text-stone-400">{ru}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
