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

// 🔥 автоформат времени
function formatTime(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 3) return "0" + digits[0] + ":" + digits.slice(1);
  if (digits.length === 4) return digits.slice(0, 2) + ":" + digits.slice(2);

  return value;
}

export default function Home() {
  const equipeNames = (Object.keys(equipes) as EquipeName[]).filter(
    (e) => equipes[e].workers.length > 0
  );

  const [date, setDate] = useState(today());
  const [selectedEquipe, setSelectedEquipe] = useState<EquipeName>(equipeNames[0]);
  const [status, setStatus] = useState("");

  const [workers, setWorkers] = useState<WorkerRow[]>(
    equipes[equipeNames[0]].workers.map((name) => ({
      name,
      start: "",
      end: "",
      pause: "",
      extra: "",
      absent: false,
    }))
  );

  function changeEquipe(equipe: EquipeName) {
    setSelectedEquipe(equipe);
    setWorkers(
      equipes[equipe].workers.map((name) => ({
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
    setWorkers((prev) =>
      prev.map((w) => ({
        ...w,
        ...DEFAULT_DAY,
        absent: false,
      }))
    );
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
      prev.map((w, i) =>
        i === index ? { ...w, [field]: value } : w
      )
    );
  }

  async function submitForm() {
  const url = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

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
          <span className="block text-sm text-slate-400">
            Учёт времени
          </span>
        </h1>

        {/* ÉQUIPE */}
        <div className="mt-6">
          <label className="font-bold">
            Équipe
            <span className="block text-xs text-slate-400">Бригада</span>
          </label>

          <select
            className="input mt-2"
            value={selectedEquipe}
            onChange={(e) => changeEquipe(e.target.value as EquipeName)}
          >
            {equipeNames.map((e) => (
              <option key={e} value={e}>
                {e} — {equipes[e].chef}
              </option>
            ))}
          </select>
        </div>

        {/* DATE */}
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

        {/* BUTTONS */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => setDate(today())}
            className="btn btn-dark"
          >
            Aujourd’hui
            <span className="block text-xs">Сегодня</span>
          </button>

          <button
            onClick={setStandardDay}
            className="btn btn-primary"
          >
            Journée standard
            <span className="block text-xs">Стандарт</span>
          </button>
        </div>

        {/* WORKERS */}
        <div className="mt-6 space-y-4">
          {workers.map((w, i) => (
            <div key={i} className="card">
              <div className="flex justify-between mb-3">
                <p className="font-bold">{w.name}</p>

                <button
                  onClick={() => toggleAbsent(i)}
                  className={`px-3 py-1 rounded-full text-sm ${
                    w.absent ? "bg-red-600 text-white" : "bg-slate-200"
                  }`}
                >
                  Absent
                  <span className="block text-[10px]">Нет</span>
                </button>
              </div>

              {!w.absent && (
                <div className="grid grid-cols-2 gap-2">
                  <Time label="Début" ru="Начало" value={w.start} onChange={(v)=>updateWorker(i,"start",v)} />
                  <Time label="Fin" ru="Конец" value={w.end} onChange={(v)=>updateWorker(i,"end",v)} />
                  <Time label="Pause" ru="Перерыв" value={w.pause} onChange={(v)=>updateWorker(i,"pause",v)} />
                  <Time label="H. supp" ru="Перераб." value={w.extra} onChange={(v)=>updateWorker(i,"extra",v)} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* SUBMIT */}
        <button
          onClick={submitForm}
          className="btn btn-green w-full mt-6 text-lg"
        >
          Envoyer
          <span className="block text-xs">Отправить</span>
        </button>

        {status && <p className="mt-4 text-center">{status}</p>}
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
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(formatTime(e.target.value))}
      />
    </div>
  );
}