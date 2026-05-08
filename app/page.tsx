"use client";

import { useState } from "react";
import { equipes, EquipeName } from "@/data/equipes";

type WorkerRow = {
  name: string;
  start: string;
  end: string;
  pause: string;
  extra: string;
  absent: boolean;
};

const DEFAULT_DAY = {
  start: "08:00",
  end: "17:00",
  pause: "01:00",
  extra: "00:00",
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function formatLive(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);

  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ":" + digits.slice(2);
}

function normalizeTime(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length <= 2) {
    return `${digits.padStart(2, "0")}:00`;
  }

  const normalized = digits.slice(0, 4).padEnd(4, "0");
  return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
}

export default function Home() {
  const equipeNames = (Object.keys(equipes) as EquipeName[]).filter(
    (e) => equipes[e].workers.length > 0
  );

  const [date, setDate] = useState(today());
  const [selectedEquipe, setSelectedEquipe] = useState<EquipeName | "">("");
  const [status, setStatus] = useState("");
  const [workers, setWorkers] = useState<WorkerRow[]>([]);

  function changeEquipe(equipe: string) {
    if (!equipe || !(equipe in equipes)) return;

    const validEquipe = equipe as EquipeName;

    setSelectedEquipe(validEquipe);
    setStatus("");

    setWorkers(
      equipes[validEquipe].workers.map((name) => ({
        name,
        start: "",
        end: "",
        pause: "",
        extra: "",
        absent: false,
      }))
    );
  }

  function setStandardDay() {
    if (!selectedEquipe) {
      setStatus("❌ Сначала выберите бригаду");
      return;
    }

    setWorkers((prev) =>
      prev.map((w) => ({
        ...w,
        ...DEFAULT_DAY,
        absent: false,
      }))
    );

    setStatus("");
  }

  function toggleAbsent(index: number) {
    setWorkers((prev) =>
      prev.map((w, i) =>
        i === index
          ? {
              ...w,
              absent: !w.absent,
              start: "",
              end: "",
              pause: "",
              extra: "",
            }
          : w
      )
    );
  }

  function updateWorker(index: number, field: keyof WorkerRow, value: string) {
    setWorkers((prev) =>
      prev.map((w, i) => (i === index ? { ...w, [field]: value } : w))
    );
  }

  async function submitForm() {
    const url = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

    if (!selectedEquipe) {
      setStatus("❌ Выберите бригаду");
      return;
    }

    if (!url) {
      setStatus("❌ Нет ссылки");
      return;
    }

    try {
      setStatus("⏳ Отправка...");

      const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify({
          date,
          equipe: selectedEquipe,
          chef: equipes[selectedEquipe].chef,
          workers,
        }),
      });

      const text = await response.text();

      if (!response.ok) {
        throw new Error(text);
      }

      setStatus("✅ Отправлено: " + text);
    } catch (error) {
      console.error(error);
      setStatus("❌ Ошибка отправки. Смотри Console.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <h1 className="text-center text-3xl font-black">
          Suivi des heures
          <span className="block text-sm text-slate-400">Учёт времени</span>
        </h1>

        <div className="mt-6">
          <label className="font-bold">
            Équipe
            <span className="block text-xs text-slate-400">Бригада</span>
          </label>

          <select
            className="input mt-2"
            value={selectedEquipe}
            onChange={(e) => changeEquipe(e.target.value)}
          >
            <option value="" disabled>
              Sélectionner une équipe / Выберите бригаду
            </option>

            {equipeNames.map((e) => (
              <option key={e} value={e}>
                {e} — {equipes[e].chef}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="font-bold">
            Date
            <span className="block text-xs text-slate-400">Дата</span>
          </label>

          <input
            type="date"
            className="input mt-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => setDate(today())} className="btn btn-dark">
            Aujourd’hui
            <span className="block text-xs">Сегодня</span>
          </button>

          <button onClick={setStandardDay} className="btn btn-primary">
            Journée standard
            <span className="block text-xs">Стандарт</span>
          </button>
        </div>

        {workers.length === 0 && (
          <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-400">
            Sélectionnez une équipe
            <span className="block">Выберите бригаду</span>
          </p>
        )}

        <div className="mt-6 space-y-4">
          {workers.map((w, i) => (
            <div key={w.name} className="card">
              <div className="mb-3 flex justify-between gap-3">
                <p className="font-bold">{w.name}</p>

                <button
                  onClick={() => toggleAbsent(i)}
                  className={`rounded-full px-3 py-1 text-sm font-bold ${
                    w.absent ? "bg-red-600 text-white" : "bg-slate-200"
                  }`}
                >
                  Absent
                  <span className="block text-[10px]">Отсутствует</span>
                </button>
              </div>

              {!w.absent && (
                <div className="grid grid-cols-2 gap-2">
                  <Time
                    label="Début"
                    ru="Начало"
                    value={w.start}
                    onChange={(v) => updateWorker(i, "start", v)}
                  />
                  <Time
                    label="Fin"
                    ru="Конец"
                    value={w.end}
                    onChange={(v) => updateWorker(i, "end", v)}
                  />
                  <Time
                    label="Pause"
                    ru="Перерыв"
                    value={w.pause}
                    onChange={(v) => updateWorker(i, "pause", v)}
                  />
                  <Time
                    label="H. supp"
                    ru="Перераб."
                    value={w.extra}
                    onChange={(v) => updateWorker(i, "extra", v)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={submitForm} className="btn btn-green mt-6 w-full text-lg">
          Envoyer
          <span className="block text-xs">Отправить</span>
        </button>

        {status && <p className="mt-4 text-center font-bold">{status}</p>}
      </div>
    </main>
  );
}

function Time({
  label,
  ru,
  value,
  onChange,
}: {
  label: string;
  ru: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-500">
        {label}
        <span className="block text-[10px] text-slate-400">{ru}</span>
      </label>

      <input
        type="text"
        inputMode="numeric"
        className="input"
        value={value}
        onChange={(e) => onChange(formatLive(e.target.value))}
        onBlur={(e) => onChange(normalizeTime(e.target.value))}
      />
    </div>
  );
}