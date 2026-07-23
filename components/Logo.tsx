/** VLADIS brand mark — the official logo asset (public/logo.jpg): a circle
 *  enclosing a radiating tree motif with a trunk, white on the brand blue.
 *  Fills whatever rounded container it's placed in — the parent div must have
 *  `overflow-hidden` so the image clips to that container's own radius. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpg"
      alt="VLADIS"
      width={size}
      height={size}
      className={`h-full w-full object-cover ${className}`}
    />
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
