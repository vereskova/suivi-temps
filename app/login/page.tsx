"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";
import { Mail, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  const nextParam =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;

  async function signInWithPassword() {
    if (!email.trim() || !password) return;
    setStatus("sending");
    setPwError(false);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setPwError(true);
      setStatus("idle");
      return;
    }
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("auth_user_id", data.user.id).maybeSingle();
    const safeNext = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
    router.replace(roleRow?.role === "controleur" ? "/controle" : roleRow?.role === "brigadir" ? "/brigadir" : safeNext);
  }

  async function sendMagicLink() {
    if (!email.trim()) return;
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}`,
      },
    });

    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="relative min-h-screen overflow-hidden p-4 flex items-center justify-center">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-primary-100/60 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-3xl border border-stone-100 bg-white p-7 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-primary-600 text-white shadow-[var(--shadow-pop)]">
            <LogoMark size={56} />
          </div>
          <h1 className="mt-4 text-xl font-extrabold tracking-tight text-stone-900">
            VLADIS
          </h1>
          <p className="text-sm font-semibold text-stone-400">
            Suivi des heures
            <span className="mx-1.5 text-stone-300">·</span>
            Вход
          </p>
        </div>

        <label className="mt-7 block text-sm font-bold text-stone-700">
          Email
          <input
            type="email"
            className="input mt-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@vladis.fr"
            disabled={status === "sending" || status === "sent"}
          />
        </label>

        {usePassword && (
          <label className="mt-4 block text-sm font-bold text-stone-700">
            Mot de passe / Пароль
            <input
              type="password"
              className="input mt-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signInWithPassword()}
              autoComplete="current-password"
            />
          </label>
        )}
        {usePassword && pwError && (
          <p className="mt-3 rounded-xl bg-error-50 px-3 py-2 text-center text-sm font-bold text-error-600">
            Email ou mot de passe incorrect. / Неверная почта или пароль.
          </p>
        )}
        {usePassword && (
          <button onClick={signInWithPassword} disabled={status === "sending"} className="btn btn-primary mt-4 w-full">
            {status === "sending" ? "…" : "Se connecter / Войти"}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setUsePassword(!usePassword); setPwError(false); }}
          className="mt-3 w-full text-center text-xs font-bold text-stone-400 underline"
        >
          {usePassword ? "Recevoir un lien par email / Получить ссылку на почту" : "Connexion par mot de passe / Войти по паролю"}
        </button>

        <button
          onClick={sendMagicLink}
          disabled={status === "sending" || status === "sent"}
          className={`btn btn-primary mt-4 w-full ${usePassword ? "hidden" : ""}`}
        >
          {status === "sent" ? (
            <>
              <CheckCircle2 size={16} /> Lien envoyé
            </>
          ) : status === "sending" ? (
            "Envoi…"
          ) : (
            <>
              <Mail size={16} /> Recevoir le lien
            </>
          )}
        </button>

        {status === "sent" && (
          <p className="mt-4 rounded-xl bg-success-50 px-3 py-2 text-center text-sm font-semibold text-success-600">
            Vérifiez votre boîte mail et cliquez sur le lien pour vous
            connecter.
            <span className="block font-medium opacity-80">Проверьте почту и перейдите по ссылке.</span>
          </p>
        )}

        {status === "error" && (
          <p className="mt-4 rounded-xl bg-error-50 px-3 py-2 text-center text-sm font-bold text-error-600">
            Erreur d&apos;envoi. Réessayez.
          </p>
        )}
      </div>
    </main>
  );
}
