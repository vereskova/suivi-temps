export function formatLive(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);

  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ":" + digits.slice(2);
}

export function normalizeTime(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length <= 2) {
    return `${digits.padStart(2, "0")}:00`;
  }

  const normalized = digits.slice(0, 4).padEnd(4, "0");
  return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
}

export function timeToMinutes(value: string) {
  if (!value) return 0;
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToHHMM(min: number | null | undefined) {
  if (min === null || min === undefined) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
