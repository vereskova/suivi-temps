"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";

/** App segment error boundary — Next.js renders this in place of the page
 *  whenever a render/runtime error escapes a nested route. There's no
 *  error-tracking service wired up yet, so console.error is the only sink. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen p-4 md:p-8 flex items-center justify-center">
      <div className="card max-w-sm text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-primary-600 text-white">
          <LogoMark size={44} />
        </div>
        <p className="font-bold text-stone-900">Une erreur est survenue</p>
        <p className="text-sm text-stone-400 mt-1">Произошла ошибка.</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => reset()} className="btn btn-dark">
            {"Réessayer / Повторить"}
          </button>
          <Link href="/" className="btn btn-secondary">
            {"Retour à l'accueil / На главную"}
          </Link>
        </div>
      </div>
    </main>
  );
}
