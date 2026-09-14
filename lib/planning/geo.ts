// Prevaly's own visit center — from the address in their convocation
// e-mails ("PREVALY - LABEGE, 227 rue Pierre Gilles de Gennes, 31670
// LABEGE") and confirmed against its own Google Maps link.
export const LABEGE_COORDS = { lat: 43.539959, lng: 1.513886 };

export function parseCoords(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  // Most cells use "lat, lng"; a few have a typo'd extra dot instead of a
  // comma between the two numbers (e.g. "43.091667.2.278811") — matching
  // decimal numbers directly handles both.
  const matches = raw.match(/-?\d{1,3}\.\d+/g);
  if (!matches || matches.length < 2) return null;
  const lat = Number(matches[0]);
  const lng = Number(matches[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough drive-time estimate from straight-line distance — not real routing
 *  (no map API involved), so it's deliberately conservative: a 1.3×
 *  circuity factor for actual road distance over "as the crow flies", at a
 *  70 km/h average blending highway and rural chantier-access roads. Good
 *  enough to shortlist candidates; always meant to be double-checked before
 *  actually committing someone to a date. */
export function estimateDrivingMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const km = haversineKm(a, b) * 1.3;
  const avgSpeedKmh = 70;
  return Math.round((km / avgSpeedKmh) * 60);
}
