import { OBLAST_BY_UID } from '../alerts/oblasts.js';

const place = (uid) => OBLAST_BY_UID.get(uid)?.title ?? 'невідомий регіон';

// Тексти пушів (інтерфейс лише українською)
export const msg = {
  alertParent: (child, uid, status) => ({
    title: status === 'A' ? 'Повітряна тривога' : 'Часткова тривога',
    body: status === 'A'
      ? `${place(uid)}: оголошено тривогу. ${child.name} зараз у цьому регіоні.`
      : `${place(uid)}: тривога в частині громад. ${child.name} зараз у цій області.`,
    urgent: true,
  }),
  alertEndParent: (child, uid) => ({
    title: 'Відбій тривоги',
    body: `${place(uid)}: відбій. ${child.name} у цьому регіоні.`,
  }),
  alertChild: (uid, status) => ({
    title: status === 'A' ? 'Повітряна тривога!' : 'Можлива тривога поруч',
    body: status === 'A'
      ? `${place(uid)}: прямуй до найближчого укриття. Натисни «Я в укритті», коли будеш там.`
      : `${place(uid)}: тривога в частині області. Будь уважним і тримай телефон поруч.`,
    urgent: true,
  }),
  alertEndChild: (uid) => ({ title: 'Відбій тривоги', body: `${place(uid)}: відбій тривоги.` }),
  movedIntoAlert: (child, uid) => ({
    title: 'Дитина в зоні тривоги',
    body: `${child.name} переміщується: ${place(uid)}, там зараз тривога.`,
    urgent: true,
  }),
  sos: (child) => ({ title: 'SOS!', body: `${child.name} натиснув(-ла) кнопку SOS. Відкрийте карту.`, urgent: true }),
  shelter: (child) => ({ title: 'В укритті', body: `${child.name}: «Я в укритті».` }),
  geofenceEnter: (child, zone) => ({ title: zone.name, body: `${child.name} прибув(-ла): ${zone.name}.` }),
  geofenceExit: (child, zone) => ({ title: zone.name, body: `${child.name} залишив(-ла): ${zone.name}.` }),
  lowBattery: (child, pct) => ({ title: 'Низький заряд', body: `У телефоні ${child.name} лишилось ${pct}% заряду.` }),
};
