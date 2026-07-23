"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatLive, normalizeTime, timeToMinutes } from "@/lib/time";
import { LogoMark } from "@/components/Logo";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/StateMessage";

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

function statusTone(status: string): "success" | "error" | "info" {
  if (status.startsWith("✅")) return "success";
  if (status.startsWith("❌")) return "error";
  return "info";
}

const STATUS_TONE_CLASSES: Record<string, string> = {
  success: "bg-success-50 text-success-600",
  error: "bg-error-50 text-error-600",
  info: "bg-primary-50 text-primary-700",
};

export default function Home() {
  const [supabase] = useState(() => createClient());
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
      <main className="relative min-h-screen overflow-hidden p-4 flex items-start justify-center pt-16">
        <BackgroundGlow />
        <div className="relative w-full max-w-md rounded-3xl border border-stone-100 bg-white p-6 shadow-xl space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden p-4 flex items-start justify-center pt-10 sm:pt-16">
      <BackgroundGlow />

      <div className="relative w-full max-w-md rounded-3xl border border-stone-100 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary-600 text-white">
              <LogoMark size={40} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight text-stone-900">
                Suivi des heures
              </h1>
              <p className="text-xs font-semibold text-stone-400">Учёт времени</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 pt-1">
            {isAdmin && (
              <Link href="/admin" className="text-xs font-bold text-primary-600 hover:text-primary-700">
                Tableau RH
              </Link>
            )}
            <button
              onClick={signOut}
              className="flex items-center gap-1 text-xs font-semibold text-stone-400 hover:text-stone-600"
            >
              <LogOut size={12} />
              Déconnexion
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className="mt-6">
            <label className="font-bold text-sm text-stone-700">
              Équipe
              <span className="block text-xs font-medium text-stone-400">Бригада</span>
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
          <label className="font-bold text-sm text-stone-700">
            Date
            <span className="block text-xs font-medium text-stone-400">Дата</span>
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
            <span className="block text-xs font-normal opacity-70">Сегодня</span>
          </button>

          <button onClick={setStandardDay} className="btn btn-primary">
            Journée standard
            <span className="block text-xs font-normal opacity-80">Стандарт</span>
          </button>
        </div>

        {workers.length === 0 && (
          <div className="mt-6 rounded-2xl bg-stone-50">
            <EmptyState
              title={isAdmin ? "Sélectionnez une équipe" : "Aucune équipe assignée"}
              description={
                isAdmin
                  ? "Выберите бригаду"
                  : "Бригада не назначена — обратитесь к RH"
              }
            />
          </div>
        )}

        <div className="mt-6 space-y-4">
          {workers.map((w, i) => (
            <div key={w.employeeId} className="card">
              <div className="mb-3 flex justify-between gap-3">
                <p className="font-bold">{w.name}</p>

                <button
                  onClick={() => toggleAbsent(i)}
                  className={`rounded-full px-3 py-1 text-sm font-bold transition-colors ${
                    w.absent ? "bg-error-50 text-error-600" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  Absent
                  <span className="block text-[10px] font-semibold opacity-80">Отсутствует</span>
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
            <span className="block text-xs font-normal opacity-80">Отправить</span>
          </button>
        )}

        {status && (
          <p
            className={`mt-4 rounded-xl px-3 py-2 text-center text-sm font-bold ${STATUS_TONE_CLASSES[statusTone(status)]}`}
          >
            {status}
          </p>
        )}
      </div>
    </main>
  );
}

function BackgroundGlow() {
  return (
    <>
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-primary-100/60 blur-3xl" />
    </>
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
      <label className="text-xs font-bold text-stone-500">
        {label}
        <span className="block text-[10px] font-medium text-stone-400">{ru}</span>
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
