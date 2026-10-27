import type { Locale } from '../../database/types';

export type NotificationKind =
  | 'sos'
  | 'sos_repeat'
  | 'sos_cancelled'
  | 'sos_acknowledged'
  | 'geofence_enter'
  | 'geofence_exit'
  | 'child_joined'
  | 'child_left'
  | 'sharing_paused'
  | 'sharing_resumed'
  | 'parent_joined';

export interface MessageParams {
  child?: string;
  parent?: string;
  zone?: string;
  time?: string;
  battery?: number;
}

type Template = (p: MessageParams) => { title: string; body: string };

const battery = (p: MessageParams, label: string) => (p.battery !== undefined ? ` · ${label} ${p.battery}%` : '');

// Ukrainian copy avoids gendered past-tense verbs, since the child's gender is not collected.
const uk: Record<NotificationKind, Template> = {
  sos: (p) => ({ title: `🆘 SOS: ${p.child}`, body: `${p.child} надсилає сигнал тривоги о ${p.time}${battery(p, 'батарея')}. Відкрийте, щоб побачити місце.` }),
  sos_repeat: (p) => ({ title: `🆘 SOS досі активний: ${p.child}`, body: `Ніхто ще не підтвердив сигнал. Відкрийте застосунок.` }),
  sos_cancelled: (p) => ({ title: `${p.child}: тривогу скасовано`, body: `Помилкова тривога, все гаразд (${p.time}).` }),
  sos_acknowledged: (p) => ({ title: `${p.parent} бачить твій сигнал`, body: `Допомога вже поруч. Тримай телефон при собі.` }),
  geofence_enter: (p) => ({ title: `${p.child} — у зоні «${p.zone}»`, body: `Вхід до зони о ${p.time}` }),
  geofence_exit: (p) => ({ title: `${p.child} — поза зоною «${p.zone}»`, body: `Вихід із зони о ${p.time}` }),
  child_joined: (p) => ({ title: `${p.child} під'єднано`, body: `Тепер ви бачите геолокацію на карті.` }),
  child_left: (p) => ({ title: `${p.child} більше не передає геолокацію`, body: `Пристрій від'єднано від сім'ї о ${p.time}.` }),
  sharing_paused: (p) => ({ title: `${p.child} призупиняє геолокацію`, body: `Передачу буде відновлено о ${p.time}.` }),
  sharing_resumed: (p) => ({ title: `${p.child} знову передає геолокацію`, body: `Передачу відновлено о ${p.time}.` }),
  parent_joined: (p) => ({ title: `${p.parent} приєднується до сім'ї`, body: `Тепер ${p.parent} теж бачить дітей на карті.` }),
};

const en: Record<NotificationKind, Template> = {
  sos: (p) => ({ title: `🆘 SOS: ${p.child}`, body: `${p.child} sent an alert at ${p.time}${battery(p, 'battery')}. Open to see the location.` }),
  sos_repeat: (p) => ({ title: `🆘 SOS still active: ${p.child}`, body: `Nobody has acknowledged the alert yet. Open the app.` }),
  sos_cancelled: (p) => ({ title: `${p.child}: alert cancelled`, body: `False alarm, everything is fine (${p.time}).` }),
  sos_acknowledged: (p) => ({ title: `${p.parent} sees your alert`, body: `Help is on the way. Keep your phone with you.` }),
  geofence_enter: (p) => ({ title: `${p.child} arrived at ${p.zone}`, body: `Entered at ${p.time}` }),
  geofence_exit: (p) => ({ title: `${p.child} left ${p.zone}`, body: `Left at ${p.time}` }),
  child_joined: (p) => ({ title: `${p.child} is connected`, body: `You can now see their location on the map.` }),
  child_left: (p) => ({ title: `${p.child} stopped sharing location`, body: `The device left the family at ${p.time}.` }),
  sharing_paused: (p) => ({ title: `${p.child} paused location sharing`, body: `Sharing resumes at ${p.time}.` }),
  sharing_resumed: (p) => ({ title: `${p.child} is sharing location again`, body: `Resumed at ${p.time}.` }),
  parent_joined: (p) => ({ title: `${p.parent} joined the family`, body: `${p.parent} can now see the children on the map.` }),
};

const ru: Record<NotificationKind, Template> = {
  sos: (p) => ({ title: `🆘 SOS: ${p.child}`, body: `${p.child} отправляет сигнал тревоги в ${p.time}${battery(p, 'батарея')}. Откройте, чтобы увидеть место.` }),
  sos_repeat: (p) => ({ title: `🆘 SOS всё ещё активен: ${p.child}`, body: `Никто ещё не подтвердил сигнал. Откройте приложение.` }),
  sos_cancelled: (p) => ({ title: `${p.child}: тревога отменена`, body: `Ложная тревога, всё в порядке (${p.time}).` }),
  sos_acknowledged: (p) => ({ title: `${p.parent} видит твой сигнал`, body: `Помощь уже рядом. Держи телефон при себе.` }),
  geofence_enter: (p) => ({ title: `${p.child} — в зоне «${p.zone}»`, body: `Вход в зону в ${p.time}` }),
  geofence_exit: (p) => ({ title: `${p.child} — вне зоны «${p.zone}»`, body: `Выход из зоны в ${p.time}` }),
  child_joined: (p) => ({ title: `${p.child} подключён(а)`, body: `Теперь вы видите геолокацию на карте.` }),
  child_left: (p) => ({ title: `${p.child} больше не передаёт геолокацию`, body: `Устройство отключено от семьи в ${p.time}.` }),
  sharing_paused: (p) => ({ title: `${p.child} приостанавливает геолокацию`, body: `Передача возобновится в ${p.time}.` }),
  sharing_resumed: (p) => ({ title: `${p.child} снова передаёт геолокацию`, body: `Передача возобновлена в ${p.time}.` }),
  parent_joined: (p) => ({ title: `${p.parent} присоединяется к семье`, body: `Теперь ${p.parent} тоже видит детей на карте.` }),
};

const catalogs: Record<Locale, Record<NotificationKind, Template>> = { uk, en, ru };

export function renderMessage(kind: NotificationKind, locale: Locale, params: MessageParams): { title: string; body: string } {
  return (catalogs[locale] ?? uk)[kind](params);
}

/** 24-hour local time in the recipient's timezone, e.g. "08:12". */
export function formatTime(at: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(at);
  } catch {
    return new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Kyiv' }).format(at);
  }
}
