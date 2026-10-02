"use client";

import { useRef, useState } from "react";
import { Calendar } from "lucide-react";

/** "2022-12-01" -> "01/12/2022"; anything else -> "". */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "01/12/2022" -> "2022-12-01" if it is a real calendar date, else null. */
function dmyToIso(dmy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/** Keeps digits only and re-inserts the slashes as the user types (max 8 digits). */
function maskDmy(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type DateEvent = { target: { value: string } };

/** Drop-in replacement for <input type="date"> that always shows and accepts
 *  jj/mm/aaaa, whatever the browser's locale — a native date input follows the
 *  OS/browser language and cannot be forced. `value`/`defaultValue` and every
 *  value passed to onChange/onBlur stay ISO (YYYY-MM-DD, or "" when empty), so
 *  call sites keep working with the same data as before. A small calendar
 *  button still opens the native picker. */
export default function DateInput({
  value,
  defaultValue,
  onChange,
  onBlur,
  onKeyDown,
  className = "input",
  disabled,
  autoFocus,
  title,
}: {
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (e: DateEvent) => void;
  onBlur?: (e: DateEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  title?: string;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<string>(defaultValue ?? "");
  const iso = controlled ? (value ?? "") : inner;
  const [text, setText] = useState(isoToDmy(iso));
  const pickerRef = useRef<HTMLInputElement>(null);

  // Follow external changes (form reset, row switch) without fighting a half-typed value.
  const [seenIso, setSeenIso] = useState(iso);
  if (seenIso !== iso) {
    setSeenIso(iso);
    if (dmyToIso(text) !== iso && !(iso === "" && text === "")) setText(isoToDmy(iso));
  }

  function commit(nextIso: string) {
    if (!controlled) setInner(nextIso);
    onChange?.({ target: { value: nextIso } });
  }

  return (
    <span className={`relative inline-block ${/(^|\s)w-/.test(className) ? "" : "w-full"}`}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="jj/mm/aaaa"
        maxLength={10}
        autoFocus={autoFocus}
        disabled={disabled}
        title={title}
        className={`${className} pr-7`}
        value={text}
        onChange={(ev) => {
          const masked = maskDmy(ev.target.value);
          setText(masked);
          if (masked === "") commit("");
          else {
            const parsed = dmyToIso(masked);
            if (parsed) commit(parsed);
          }
        }}
        onBlur={() => {
          const parsed = dmyToIso(text);
          if (text !== "" && !parsed) setText(isoToDmy(iso));
          onBlur?.({ target: { value: parsed ?? (text === "" ? "" : iso) } });
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Calendrier / Календарь"
        onClick={() => pickerRef.current?.showPicker?.()}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 disabled:opacity-40"
      >
        <Calendar size={14} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        onChange={(ev) => {
          setText(isoToDmy(ev.target.value));
          commit(ev.target.value);
        }}
        className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
      />
    </span>
  );
}
