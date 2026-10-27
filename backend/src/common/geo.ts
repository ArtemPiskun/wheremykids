const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Perpendicular distance from p to segment ab in metres, using a local equirectangular projection. */
function segmentDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos(toRad((a.lat + b.lat) / 2)) * EARTH_RADIUS_M;
  const ax = toRad(a.lng) * k, ay = toRad(a.lat) * EARTH_RADIUS_M;
  const bx = toRad(b.lng) * k, by = toRad(b.lat) * EARTH_RADIUS_M;
  const px = toRad(p.lng) * k, py = toRad(p.lat) * EARTH_RADIUS_M;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Iterative Douglas–Peucker; keeps endpoints and points whose `keep` predicate is true (e.g. SOS points). */
export function simplifyPath<T extends LatLng>(points: T[], epsilonM: number, keep?: (p: T) => boolean): T[] {
  if (points.length <= 2) return points;
  const marked = new Uint8Array(points.length);
  marked[0] = 1;
  marked[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > epsilonM) {
      marked[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((p, i) => marked[i] === 1 || (keep?.(p) ?? false));
}
