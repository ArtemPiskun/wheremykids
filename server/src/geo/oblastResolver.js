import { readFile } from 'node:fs/promises';
import { matchOblast } from '../alerts/oblasts.js';

// Чи лежить точка всередині кільця полігона (ray casting); ring — [[lon, lat], ...]
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon, lat, rings) {
  if (!inRing(lon, lat, rings[0])) return false;
  return !rings.slice(1).some((hole) => inRing(lon, lat, hole));
}

function bbox(polygons) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polygons) {
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

const NAME_KEYS = ['shapeName', 'name_uk', 'name:uk', 'NAME_1', 'name', 'name_en'];

// Визначає область за межами з GeoJSON (наприклад, geoBoundaries UKR ADM1)
export function geojsonResolver(geojson) {
  const shapes = [];
  for (const f of geojson.features ?? []) {
    const props = f.properties ?? {};
    let uid = null;
    for (const k of NAME_KEYS) {
      uid = matchOblast(props[k]);
      if (uid != null) break;
    }
    if (uid == null || !f.geometry) continue;
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    if (polygons.length) shapes.push({ uid, polygons, bbox: bbox(polygons) });
  }
  // Менші області першими: місто Київ лежить усередині Київської області
  shapes.sort((a, b) => (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]));
  return {
    shapeCount: shapes.length,
    async resolve(lat, lon) {
      for (const s of shapes) {
        const [minX, minY, maxX, maxY] = s.bbox;
        if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
        if (s.polygons.some((p) => inPolygon(lon, lat, p))) return s.uid;
      }
      return null;
    },
  };
}

export async function loadGeojsonResolver(path) {
  return geojsonResolver(JSON.parse(await readFile(path, 'utf8')));
}

// Запасний варіант: зворотне геокодування через Nominatim (OpenStreetMap).
// Політика Nominatim — не частіше 1 запиту на секунду, тож кешуємо результат
// по клітинці ~5 км; для продакшну краще покласти файл меж (OBLAST_GEOJSON_PATH).
export function nominatimResolver({ fetchImpl = fetch, userAgent = 'moi-dity-server/0.1' } = {}) {
  const cache = new Map();
  return {
    async resolve(lat, lon) {
      const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      if (cache.has(key)) return cache.get(key);
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&accept-language=uk&lat=${lat}&lon=${lon}`;
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
      if (!res.ok) return null;
      const body = await res.json();
      const a = body.address ?? {};
      if (a.country_code && a.country_code !== 'ua') {
        cache.set(key, null);
        return null;
      }
      const uid = matchOblast(a.state) ?? matchOblast(a.city);
      cache.set(key, uid);
      return uid;
    },
  };
}

// Якщо джерела немає — область невідома, тривоги по дитині не надсилаються
export const nullResolver = { async resolve() { return null; } };
