// Області України в порядку, у якому їх повертає
// GET /v1/iot/active_air_raid_alerts_by_oblast.json (alerts.in.ua):
// i-й символ рядка статусу відповідає i-й області цього списку.
// uid — ідентифікатор області в alerts.in.ua.
// stems — фрагменти назв (укр/рос/лат), за якими розпізнаємо область у геоданих.
export const OBLASTS = [
  { uid: 29, title: 'Автономна Республіка Крим', stems: ['крим', 'crimea', 'krym'] },
  { uid: 8, title: 'Волинська область', stems: ['волин', 'volyn'] },
  { uid: 4, title: 'Вінницька область', stems: ['вінниц', 'винниц', 'vinnyts', 'vinnits'] },
  { uid: 9, title: 'Дніпропетровська область', stems: ['дніпропетр', 'днепропетр', 'dnipropetr', 'dnepropetr'] },
  { uid: 28, title: 'Донецька область', stems: ['донець', 'донецк', 'donets'] },
  { uid: 10, title: 'Житомирська область', stems: ['житомир', 'zhytomyr', 'zhitomir'] },
  { uid: 11, title: 'Закарпатська область', stems: ['закарпат', 'zakarpat', 'transcarpath'] },
  { uid: 12, title: 'Запорізька область', stems: ['запоріз', 'запорож', 'zaporiz', 'zaporozh'] },
  { uid: 13, title: 'Івано-Франківська область', stems: ['франків', 'франков', 'frankivs', 'frankovs'] },
  { uid: 31, title: 'м. Київ', stems: [] }, // місто Київ розпізнаємо окремо, див. matchOblast
  { uid: 14, title: 'Київська область', stems: [] },
  { uid: 15, title: 'Кіровоградська область', stems: ['кіровоград', 'кировоград', 'kirovohrad', 'kirovograd', 'кропивниц', 'kropyvnyts'] },
  { uid: 16, title: 'Луганська область', stems: ['луган', 'luhan', 'lugan'] },
  { uid: 27, title: 'Львівська область', stems: ['львів', 'львов', 'lviv', 'lvov'] },
  { uid: 17, title: 'Миколаївська область', stems: ['миколаїв', 'николаев', 'mykolai', 'nikolaev'] },
  { uid: 18, title: 'Одеська область', stems: ['одес', 'odes'] },
  { uid: 19, title: 'Полтавська область', stems: ['полтав', 'poltav'] },
  { uid: 5, title: 'Рівненська область', stems: ['рівнен', 'ровен', 'rivne', 'rovno'] },
  { uid: 30, title: 'м. Севастополь', stems: ['севастоп', 'sevastop'] },
  { uid: 20, title: 'Сумська область', stems: ['сумськ', 'сумск', 'sumy', 'sums'] },
  { uid: 21, title: 'Тернопільська область', stems: ['терноп', 'ternop'] },
  { uid: 22, title: 'Харківська область', stems: ['харків', 'харьков', 'kharkiv', 'kharkov'] },
  { uid: 23, title: 'Херсонська область', stems: ['херсон', 'kherson'] },
  { uid: 3, title: 'Хмельницька область', stems: ['хмельниц', 'khmelnyts', 'khmelnits'] },
  { uid: 24, title: 'Черкаська область', stems: ['черкас', 'cherkas'] },
  { uid: 26, title: 'Чернівецька область', stems: ['чернівец', 'черновиц', 'chernivts', 'chernovts'] },
  { uid: 25, title: 'Чернігівська область', stems: ['черніг', 'чернигов', 'chernih', 'chernig'] },
];

export const OBLAST_BY_UID = new Map(OBLASTS.map((o) => [o.uid, o]));

export const KYIV_CITY_UID = 31;
export const KYIV_OBLAST_UID = 14;

// Повертає uid області за довільною назвою (з GeoJSON чи геокодера) або null
export function matchOblast(name) {
  if (!name) return null;
  const n = name.toLowerCase().replace(/[’'ʼ`]/g, '');
  if (/(київ|киев|kyiv|kiev)/.test(n)) {
    // «Київська область» / «Kyiv Oblast» — область, просто «Київ» / «Kyiv City» — місто
    return /(київськ|киевск|oblast|област|obl\b)/.test(n) ? KYIV_OBLAST_UID : KYIV_CITY_UID;
  }
  for (const o of OBLASTS) {
    if (o.stems.some((s) => n.includes(s))) return o.uid;
  }
  return null;
}

// Розбирає рядок статусу на Map<uid, 'A' | 'P' | 'N'>.
// v2 API повертає R/Y замість A — зводимо обидва до A.
export function parseStatusString(str) {
  const result = new Map();
  OBLASTS.forEach((o, i) => {
    let c = str[i] ?? 'N';
    if (c === 'R' || c === 'Y') c = 'A';
    if (c !== 'A' && c !== 'P') c = 'N';
    result.set(o.uid, c);
  });
  return result;
}
