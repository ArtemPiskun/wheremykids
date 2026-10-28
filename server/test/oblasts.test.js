import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBLASTS, matchOblast, parseStatusString } from '../src/alerts/oblasts.js';
import { geojsonResolver } from '../src/geo/oblastResolver.js';

test('27 областей з унікальними uid', () => {
  assert.equal(OBLASTS.length, 27);
  assert.equal(new Set(OBLASTS.map((o) => o.uid)).size, 27);
});

test('розпізнавання назв областей', () => {
  assert.equal(matchOblast('Київська область'), 14);
  assert.equal(matchOblast('Kyiv Oblast'), 14);
  assert.equal(matchOblast('Київ'), 31);
  assert.equal(matchOblast('Kyiv City'), 31);
  assert.equal(matchOblast('Lviv Oblast'), 27);
  assert.equal(matchOblast('Івано-Франківська область'), 13);
  assert.equal(matchOblast('Sevastopol'), 30);
  assert.equal(matchOblast('Autonomous Republic of Crimea'), 29);
  assert.equal(matchOblast('Mazowieckie'), null);
  // Кожна область розпізнається за власною українською назвою
  for (const o of OBLASTS) assert.equal(matchOblast(o.title), o.uid, o.title);
});

test('рядок статусу: позиція → область, R/Y → A', () => {
  const s = 'N'.repeat(9) + 'A' + 'P' + 'N'.repeat(10) + 'R' + 'N'.repeat(5);
  const m = parseStatusString(s);
  assert.equal(m.get(31), 'A'); // 10-та позиція — м. Київ
  assert.equal(m.get(14), 'P');
  assert.equal(m.get(22), 'A'); // Харківська, v2 «R»
  assert.equal(m.get(27), 'N');
});

test('GeoJSON: місто всередині області визначається як місто', async () => {
  const square = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  const r = geojsonResolver({
    features: [
      { properties: { shapeName: 'Kyiv Oblast' }, geometry: { type: 'Polygon', coordinates: square(29, 49, 32, 51.5) } },
      { properties: { shapeName: 'Kyiv' }, geometry: { type: 'Polygon', coordinates: square(30.3, 50.3, 30.8, 50.6) } },
      { properties: { shapeName: 'Lviv Oblast' }, geometry: { type: 'MultiPolygon', coordinates: [square(23, 49.5, 24.5, 50.2)] } },
    ],
  });
  assert.equal(r.shapeCount, 3);
  assert.equal(await r.resolve(50.45, 30.52), 31);
  assert.equal(await r.resolve(50.0, 30.0), 14);
  assert.equal(await r.resolve(49.84, 24.0), 27);
  assert.equal(await r.resolve(52.2, 21.0), null);
});
