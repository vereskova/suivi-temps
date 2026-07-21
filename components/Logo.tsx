/** VLADIS brand mark — a circle enclosing a radiating tree/palm motif with a trunk.
 *  Pure stroke-based SVG (no raster asset) so it stays crisp at any size and can
 *  be recolored via `currentColor` (e.g. white in a dark header, primary blue elsewhere). */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const rays: number = 22;
  const cx = 50;
  const cy = 46;
  const rInner = 6;
  const rOuter = 40;
  const spread = 150; // degrees of arc the rays fan across, centered on straight up
  const lines = Array.from({ length: rays }, (_, i) => {
    const t = rays === 1 ? 0.5 : i / (rays - 1);
    const angleDeg = -90 - spread / 2 + t * spread;
    const angle = (angleDeg * Math.PI) / 180;
    const x1 = cx + rInner * Math.cos(angle);
    const y1 = cy + rInner * Math.sin(angle);
    const x2 = cx + rOuter * Math.cos(angle);
    const y2 = cy + rOuter * Math.sin(angle);
    return { x1, y1, x2, y2 };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="5" />
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      ))}
      <line x1="47" y1="46" x2="47" y2="88" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <line x1="53" y1="46" x2="53" y2="88" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({
  size = 32,
  wordmark = true,
  className = "",
}: {
  size?: number;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="font-extrabold tracking-tight" style={{ fontSize: size * 0.56 }}>
          VLADIS
        </span>
      )}
    </span>
  );
}
