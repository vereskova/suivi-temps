"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Team = { id: string; name: string };
type AbsenceType = { id: string; code: string; label: string };

type WorkerRow = {
  employeeId: string;
  name: string;
  start: string;
  end: string;
  pause: string;
  extra: string;
  absent: boolean;
  absenceTypeId: string;
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

function timeToMinutes(value: string) {
  if (!value) return 0;
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export default function Home() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[]>([]);

  const [date, setDate] = useState(today());
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [status, setStatus] = useState("");
  const [workers, setWorkers] = useState<WorkerRow[]>([]);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const admin = roleRow?.role === "rh_admin";
      setIsAdmin(admin);

      const { data: teamRows, error: teamsError } = await supabase
        .from("teams")
        .select("id, name")
        .eq("active", true)
        .order("name");

      if (teamsError) {
        setStatus("❌ Impossible de charger les équipes.");
        setLoading(false);
        return;
      }

      setTeams(teamRows ?? []);

      const { data: absenceRows } = await supabase
        .from("absence_types")
        .select("id, code, label")
        .order("label");
      setAbsenceTypes(absenceRows ?? []);

      // A chef sees only their own team via RLS, so a single row means auto-select it.
      if (!admin && teamRows && teamRows.length === 1) {
        await changeTeam(teamRows[0].id);
      }

      setLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeTeam(teamId: string) {
    if (!teamId) return;

    setSelectedTeamId(teamId);
    setStatus("");

    const { data: employeeRows, error } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("team_id", teamId)
      .eq("status", "active")
      .order("last_name");

    if (error) {
      setStatus("❌ Impossible de charger la brigade.");
      return;
    }

    setWorkers(
      (employeeRows ?? []).map((e) => ({
        employeeId: e.id,
        name: `${e.last_name} ${e.first_name}`.trim(),
        start: "",
        end: "",
        pause: "",
        extra: "",
        absent: false,
        absenceTypeId: "",
      }))
    );
  }

  function setStandardDay() {
    if (!selectedTeamId) {
      setStatus("❌ Сначала выберите бригаду");
      return;
    }

    setWorkers((prev) =>
      prev.map((w) => ({
        ...w,
        ...DEFAULT_DAY,
        absent: false,
        absenceTypeId: "",
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
    if (!selectedTeamId) {
      setStatus("❌ Выберите бригаду");
      return;
    }

    setStatus("⏳ Отправка...");

    const rows = workers.map((w) => ({
      work_date: date,
      team_id: selectedTeamId,
      employee_id: w.employeeId,
      start_time: w.absent || !w.start ? null : w.start,
      end_time: w.absent || !w.end ? null : w.end,
      pause_minutes: w.absent ? null : timeToMinutes(w.pause),
      overtime_minutes: w.absent ? null : timeToMinutes(w.extra),
      is_absent: w.absent,
      absence_type_id: w.absent && w.absenceTypeId ? w.absenceTypeId : null,
    }));

    const { error } = await supabase
      .from("pointage_entries")
      .upsert(rows, { onConflict: "work_date,employee_id" });

    if (error) {
      console.error(error);
      setStatus("❌ Ошибка отправки. Смотри Console.");
      return;
    }

    setStatus("✅ Отправлено · " + new Date().toLocaleTimeString("ru"));
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 flex items-center justify-center">
        <p className="text-slate-400">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h1 className="text-3xl font-black">
            Suivi des heures
            <span className="block text-sm text-slate-400">Учёт времени</span>
          </h1>
          <button onClick={signOut} className="text-xs text-slate-400 underline">
            Déconnexion
          </button>
        </div>

        {isAdmin && (
          <div className="mt-6">
            <label className="font-bold">
              Équipe
              <span className="block text-xs text-slate-400">Бригада</span>
            </label>

            <select
              className="input mt-2"
              value={selectedTeamId}
              onChange={(e) => changeTeam(e.target.value)}
            >
              <option value="" disabled>
                Sélectionner une équipe / Выберите бригаду
              </option>

              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

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
            {isAdmin ? (
              <>
                Sélectionnez une équipe
                <span className="block">Выберите бригаду</span>
              </>
            ) : (
              <>
                Aucune équipe assignée
                <span className="block">Бригада не назначена — обратитесь к RH</span>
              </>
            )}
          </p>
        )}

        <div className="mt-6 space-y-4">
          {workers.map((w, i) => (
            <div key={w.employeeId} className="card">
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

              {w.absent && absenceTypes.length > 0 && (
                <select
                  className="input mt-2"
                  value={w.absenceTypeId}
                  onChange={(e) =>
                    updateWorker(i, "absenceTypeId", e.target.value)
                  }
                >
                  <option value="">Type d&apos;absence / Тип отсутствия</option>
                  {absenceTypes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        {workers.length > 0 && (
          <button onClick={submitForm} className="btn btn-green mt-6 w-full text-lg">
            Envoyer
            <span className="block text-xs">Отправить</span>
          </button>
        )}

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
