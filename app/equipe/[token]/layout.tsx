import type { Metadata, Viewport } from "next";

// Page privée par jeton : jamais indexée, et le jeton ne fuit pas par le Referer.
export const metadata: Metadata = {
  title: "Primes & Bonus — équipe",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
