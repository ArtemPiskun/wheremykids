import { OBLASTS } from './oblasts.js';
// Клієнт alerts.in.ua: стан тривоги в усіх областях одним рядком.
// Токен видають за заявкою: https://alerts.in.ua/api-request
const BASE = 'https://api.alerts.in.ua/v1/';

export function alertsInUaSource({ token, fetchImpl = fetch }) {
  let lastModified = null;
  let lastBody = null;
  return {
    async fetchStatusString() {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      if (lastModified) headers['If-Modified-Since'] = lastModified;
      const res = await fetchImpl(BASE + 'iot/active_air_raid_alerts_by_oblast.json', { headers });
      if (res.status === 304 && lastBody != null) return lastBody;
      if (!res.ok) throw new Error(`alerts.in.ua відповів ${res.status}`);
      // Відповідь — JSON-рядок, напр. "ANNNPN..."
      const body = await res.json();
      lastModified = res.headers.get('last-modified');
      lastBody = String(body);
      return lastBody;
    },
  };
}

// Заглушка замість alerts.in.ua: стан областей тримається в пам'яті
// і змінюється вручну (сторінка /dev/alerts або тести).
export function mockAlertsSource() {
  const statuses = new Map(OBLASTS.map((o) => [o.uid, 'N']));
  return {
    async fetchStatusString() {
      return OBLASTS.map((o) => statuses.get(o.uid)).join('');
    },
    set(uid, status) {
      if (!statuses.has(uid)) throw new Error(`Невідома область ${uid}`);
      if (!['A', 'P', 'N'].includes(status)) throw new Error(`Невідомий статус ${status}`);
      statuses.set(uid, status);
    },
    clear() {
      for (const uid of statuses.keys()) statuses.set(uid, 'N');
    },
    get(uid) {
      return statuses.get(uid);
    },
  };
}
