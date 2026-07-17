"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  async function sendMagicLink() {
    if (!email.trim()) return;
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-center text-2xl font-black">
          Suivi des heures
          <span className="block text-sm text-slate-400">Вход</span>
        </h1>

        <label className="mt-6 block font-bold">
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

        <button
          onClick={sendMagicLink}
          disabled={status === "sending" || status === "sent"}
          className="btn btn-dark mt-4 w-full"
        >
          {status === "sent" ? "Lien envoyé ✓" : "Recevoir le lien"}
        </button>

        {status === "sent" && (
          <p className="mt-4 text-center text-sm text-slate-500">
            Vérifiez votre boîte mail et cliquez sur le lien pour vous
            connecter.
            <span className="block">Проверьте почту и перейдите по ссылке.</span>
          </p>
        )}

        {status === "error" && (
          <p className="mt-4 text-center text-sm font-bold text-red-600">
            Erreur d&apos;envoi. Réessayez.
          </p>
        )}
      </div>
    </main>
  );
}
