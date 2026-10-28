import { distanceM } from './distance.js';

// Межі України з запасом ~30 км (разом із Кримом). Застосунок лише для України,
// тож точка поза цим прямокутником — майже завжди підміна GPS (РЕБ).
export const UKRAINE_BBOX = { minLat: 44.1, maxLat: 52.7, minLon: 21.8, maxLon: 40.6 };

// Швидше за 250 км/год дитина не пересувається (швидкісний потяг — до ~160 км/год)
export const MAX_SPEED_MS = 70;
// Точність гірша за 3 км — точка нічого не каже, навіть для визначення області
export const MAX_USABLE_ACCURACY_M = 3000;
// Для геозон потрібна точність не гірша за 300 м, інакше «вийшла зі школи» буде хибним
export const MAX_GEOFENCE_ACCURACY_M = 300;
// Скільки поспіль узгоджених «стрибків» і за який час визнаємо, що дитина справді переїхала
const RECOVERY_POINTS = 3;
const RECOVERY_SPAN_MS = 3 * 60e3;

export const insideUkraine = (lat, lon) =>
  lat >= UKRAINE_BBOX.minLat && lat <= UKRAINE_BBOX.maxLat && lon >= UKRAINE_BBOX.minLon && lon <= UKRAINE_BBOX.maxLon;

// Чи могла дитина дістатися з a в b: відстань мінус похибки обох точок проти часу
export function plausibleMove(a, b) {
  const dt = (Date.parse(b.recordedAt) - Date.parse(a.recordedAt)) / 1000;
  const d = distanceM(a.lat, a.lon, b.lat, b.lon) - (a.accuracy ?? 0) - (b.accuracy ?? 0);
  if (d <= 1000) return true; // дрібні зміщення не перевіряємо
  if (dt <= 0) return false;
  return d / dt <= MAX_SPEED_MS;
}

/**
 * Оцінює точку. lastGood — останнє надійне місце, recentJumps — точки, відкинуті
 * як «стрибок» після нього (від старих до нових).
 * Повертає { quality: 'ok' | 'low' | 'rejected', reason }.
 */
export function classifyPoint(point, lastGood, recentJumps = []) {
  if (point.mocked) return { quality: 'rejected', reason: 'mock' };
  if (!insideUkraine(point.lat, point.lon)) return { quality: 'rejected', reason: 'outside_ukraine' };
  if ((point.accuracy ?? 0) > MAX_USABLE_ACCURACY_M) return { quality: 'low', reason: 'inaccurate' };
  if (lastGood && Date.parse(point.recordedAt) > Date.parse(lastGood.recordedAt) && !plausibleMove(lastGood, point)) {
    // Кілька узгоджених між собою точок у новому місці протягом кількох хвилин —
    // дитина справді там (наприклад, перша надійна точка була підмінена)
    const chain = [...recentJumps.slice(-(RECOVERY_POINTS - 1)), point];
    const consistent = chain.length >= RECOVERY_POINTS && chain.every((p, i) => i === 0 || plausibleMove(chain[i - 1], p));
    const span = Date.parse(point.recordedAt) - Date.parse(chain[0].recordedAt);
    if (consistent && span >= RECOVERY_SPAN_MS) return { quality: 'ok', reason: 'confirmed_move' };
    return { quality: 'rejected', reason: 'jump' };
  }
  return { quality: 'ok', reason: null };
}
