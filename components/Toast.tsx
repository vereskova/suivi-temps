"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "warning" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

let nextId = 1;
type Listener = (item: ToastItem) => void;
const listeners = new Set<Listener>();

function push(kind: ToastKind, message: string) {
  const item = { id: nextId++, kind, message };
  listeners.forEach((l) => l(item));
}

/** Fire-and-forget toast API — call from anywhere, no hook/context wiring needed at the call site. */
export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  warning: (message: string) => push("warning", message),
  info: (message: string) => push("info", message),
};

const KIND_STYLES: Record<ToastKind, { icon: typeof Info; classes: string; iconClass: string }> = {
  success: { icon: CheckCircle2, classes: "border-emerald-200 bg-emerald-50 text-emerald-800", iconClass: "text-emerald-500" },
  error: { icon: XCircle, classes: "border-red-200 bg-red-50 text-red-800", iconClass: "text-red-500" },
  warning: { icon: AlertTriangle, classes: "border-amber-200 bg-amber-50 text-amber-800", iconClass: "text-amber-500" },
  info: { icon: Info, classes: "border-blue-200 bg-blue-50 text-blue-800", iconClass: "text-blue-500" },
};

const ToastListContext = createContext<ToastItem[]>([]);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const listener: Listener = (item) => {
      setItems((prev) => [...prev, item]);
      window.setTimeout(() => dismiss(item.id), 5000);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [dismiss]);

  return (
    <ToastListContext.Provider value={items}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm">
        {items.map((t) => {
          const style = KIND_STYLES[t.kind];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              role="alert"
              className={`animate-toast-in flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur-sm ${style.classes}`}
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${style.iconClass}`} />
              <p className="flex-1 leading-snug">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 opacity-50 hover:opacity-100"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastListContext.Provider>
  );
}

export function useToasts() {
  return useContext(ToastListContext);
}
