import { haversineMeters, simplifyPath } from '../../src/common/geo';
import { presenceStatus } from '../../src/modules/locations/location.types';
import { formatTime, renderMessage } from '../../src/modules/notifications/messages';

describe('geo', () => {
  it('measures Kyiv → Lviv at about 469 km', () => {
    const d = haversineMeters({ lat: 50.4501, lng: 30.5234 }, { lat: 49.8397, lng: 24.0297 });
    expect(d / 1000).toBeCloseTo(469, -1);
  });

  it('simplifies a straight walk to its endpoints but keeps corners and SOS points', () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ lat: 50.45 + i * 0.0001, lng: 30.52, sos: i === 7 }));
    const corner = [...line, { lat: 50.4519, lng: 30.53, sos: false }];
    const out = simplifyPath(corner, 10, (p) => p.sos);
    expect(out).toHaveLength(4);
    expect(out[1].sos).toBe(true);
  });
});

describe('presenceStatus', () => {
  const now = Date.now();
  it.each([
    [now - 60_000, 'online'],
    [now - 20 * 60_000, 'recent'],
    [now - 3 * 3_600_000, 'offline'],
    [null, 'offline'],
  ])('%p → %s', (seen, expected) => expect(presenceStatus(seen as number | null, now)).toBe(expected));

  it('reports paused while a pause is active', () => {
    expect(presenceStatus(now, now, new Date(now + 60_000))).toBe('paused');
    expect(presenceStatus(now, now, new Date(now - 60_000))).toBe('online');
  });
});

describe('notification copy', () => {
  it('formats Kyiv time in 24h and uses Ukrainian by default', () => {
    expect(formatTime(new Date('2026-10-25T05:12:00Z'), 'Europe/Kyiv')).toBe('07:12');
    expect(renderMessage('geofence_enter', 'uk', { child: 'Олена', zone: 'Школа', time: '08:12' }).title).toBe('Олена — у зоні «Школа»');
    expect(renderMessage('sos', 'en', { child: 'Olena', time: '08:12', battery: 9 }).body).toContain('battery 9%');
  });
});
