"use client";

import { useEffect } from "react";
import { LogoMark } from "@/components/Logo";
import "./globals.css";

/** Root-level fallback — only triggers when the root layout itself throws.
 *  Per Next.js convention this file must render its own <html>/<body> since
 *  it replaces the root layout entirely; a plain <a> is used instead of
 *  next/link because the app's router context may not be mounted here.
 *  There's no error-tracking service wired up yet, so console.error is the
 *  only sink. */
export default function GlobalError({
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
    <html lang="fr">
      <body>
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
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain
                  anchor is intentional: next/link needs router context that
                  may not be mounted when the root layout itself has crashed */}
              <a href="/" className="btn btn-secondary">
                {"Retour à l'accueil / На главную"}
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
