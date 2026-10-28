# Мої діти

Український застосунок для батьків: де зараз дитина, геозони, SOS, заряд телефону
і сповіщення про повітряні тривоги в області, де перебуває дитина.

Зроблено з нуля за описом поведінки «Где мои дети» (Findmykids) з публічних джерел;
жодного коду чи графіки оригіналу не використано.

```
server/   Node.js 22 + Fastify + PostgreSQL — API, геозони, опитування тривог, пуші
app/      Flutter (Android) — режими батьків і дитини
```

## Як працюють тривоги

1. Сервер кожні 15 с запитує `GET https://api.alerts.in.ua/v1/iot/active_air_raid_alerts_by_oblast.json`
   (рядок з 27 символів: `A` — тривога, `P` — часткова, `N` — немає) з `If-Modified-Since`.
2. За останньою точкою дитини визначає її область (межі областей у GeoJSON або Nominatim).
3. Коли статус області змінюється, батьки й дитина отримують пуш; при відбої — теж.
4. Якщо дитина переїхала в область, де вже триває тривога, батьки дізнаються про це окремо.
5. Дитина може натиснути «Я в укритті» — батьки бачать позначку до відбою.

## Сервер

```bash
cd server
cp .env.example .env        # впишіть ALERTS_IN_UA_TOKEN і джерело меж областей
npm install
npm run migrate
npm start
npm test                    # потрібен PostgreSQL з базою moi_test (TEST_DATABASE_URL)
```

Або з Docker: `docker compose up --build` у корені.

Що потрібно отримати:

- **Токен alerts.in.ua** — заявка на https://alerts.in.ua/api-request
- **Межі областей** — GeoJSON ADM1 України, напр. geoBoundaries (`geoBoundaries-UKR-ADM1_simplified.geojson`, ліцензія CC BY 4.0) → `OBLAST_GEOJSON_PATH`. Тимчасово можна `USE_NOMINATIM=1`.
- **Firebase** (проєкт `my-kids-1f72d`) — ключ сервісного акаунта для пушів:
  Firebase Console → Project settings → **Service accounts** → **Generate new private key**.
  Збережіть як `server/firebase-service-account.json` (у git не потрапить) і впишіть шлях у
  `GOOGLE_APPLICATION_CREDENTIALS`, або весь JSON у base64 у `FIREBASE_SERVICE_ACCOUNT_BASE64`.
  Перевірка: `npm run check-firebase`. Також у Project settings → **Cloud Messaging** має бути
  увімкнено «Firebase Cloud Messaging API (V1)».
  Для Android-застосунку потрібен ще `google-services.json` — див. `app/README.md`.

### API

| Метод | Шлях | Хто | Що робить |
| --- | --- | --- | --- |
| POST | /v1/parents | усі | реєстрація батька, повертає токен |
| POST | /v1/pair | усі | телефон дитини вводить 6-значний код |
| GET | /v1/alerts | усі | стан тривог по областях |
| PUT | /v1/devices/me/push-token | обидва | FCM-токен пристрою |
| GET/POST | /v1/children | батько | список дітей зі статусом тривоги / додати дитину |
| POST | /v1/children/:id/pairing-code | батько | код прив'язки на 15 хв |
| GET | /v1/children/:id/locations | батько | маршрут за період (типово 24 год) |
| POST | /v1/children/:id/ring | батько | гучний сигнал на телефоні дитини |
| GET/POST/DELETE | /v1/geofences | батько | геозони (радіус 50–5000 м) |
| GET | /v1/events | батько | стрічка подій |
| POST | /v1/child/locations | дитина | пачка точок (до 500) з зарядом |
| POST | /v1/child/sos | дитина | SOS |
| POST | /v1/child/shelter | дитина | «Я в укритті» |
| GET | /v1/child/me | дитина | свій статус і тривога в області |

## Ще не зроблено

- Вхід батьків за номером телефону (зараз обліковий запис прив'язаний до пристрою) і другий батько в сім'ї.
- Тривоги на рівні районів і громад (зараз — область; «часткову» тривогу показуємо окремо).
- Пуші про загрози (ракети, БпЛА) з `alerts/active.json`.
- Сімейний чат, GPS-годинники, iOS.
