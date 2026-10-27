# Де мої діти

Сімейний сервіс геолокації для України: батьківський і дитячий режими, безпечні зони, SOS, історія маршрутів. Дитина завжди бачить, що передача місця увімкнена, і дає згоду явно. Прихованого відстеження немає.

| Каталог | Що всередині |
|---|---|
| `docs/architecture.html` | Аналіз продукту та архітектура (20 пунктів) |
| `backend/` | NestJS + TypeScript, PostgreSQL, Redis, Socket.IO, BullMQ, FCM |
| `mobile/` | Flutter: один код, два застосунки (`parent` і `child`) |

## Етапи MVP і як перевірити кожен

Кожен етап запускається окремо. Нижче кроки від «нічого не встановлено» до двох телефонів.

### Етап 1. Backend: база, міграції, тести

Потрібні Node.js 22.9+, PostgreSQL 16, Redis 7 (або Docker).

```bash
cd backend
npm ci
cp .env.example .env
node scripts/gen-secrets.js            # надрукує JWT_ACCESS_SECRET, INVITE_PEPPER, AUDIT_IP_SALT, LOCATION_ENC_KEYS: вставте їх у .env
npm run build
npm run migrate
npm test                               # unit: гео-рушій, шифрування, присутність, конфіг
npm run test:e2e                       # e2e: повний сценарій сім'ї (потрібна БД demoidity_test, див. backend/README.md)
```

Варіант через Docker: `docker compose up --build` у `backend/` (Postgres, Redis, міграції, API). Секрети все одно беруться з `.env`. Якщо Postgres і Redis уже запущені через compose, e2e-тестам потрібна окрема база: `docker compose exec postgres createdb -U demoidity -O demoidity demoidity_test`.

### Етап 2. API вручну: сім'я, дитина, інвайт, зона

```bash
npm start                              # API на :3000, push-повідомлення друкуються в лог
./scripts/smoke.sh                     # реєстрація батька, сім'я, дитина, зона «Дім», код інвайту
```

### Етап 3. Симулятор дитини: маршрут, зони, SOS

```bash
npm run simulate:child -- --code XXXX-XXXX --interval 5 --sos-after 3
# імітація втрати мережі: після 3-ї точки 4 точки лише в локальній черзі, потім надсилаються разом
npm run simulate:child -- --code XXXX-XXXX --interval 5 --offline-after 3 --offline-for 4
```

Симулятор погашає інвайт (зі згодою), ходить маршрутом біля Золотих воріт у Києві, проходить через зону «Дім» і на третьому пакеті піднімає SOS. Точки спершу потрапляють у локальну чергу, як у застосунку, тож без мережі нічого не губиться. У лозі API (`PUSH_DRIVER=log`) видно push «Марко — у зоні «Дім»», «Марко — поза зоною «Дім»» і SOS: `smoke.sh` реєструє тестовий push-токен батька. Останні координати: `GET /v1/families/{id}/locations/latest`.

### Етап 3а. Увесь критичний сценарій однією командою

```bash
npm run scenario                       # проти запущеного API, за замовчуванням http://localhost:3000
```

13 кроків з перевірками: реєстрація батька, сім'я, дитина, зона, одноразовий інвайт; дитина без згоди не підключається; повторно інвайт не працює; координати приходять батькові через WebSocket і API; події входу й виходу із зони; справжній обрив мережі (вимикається TCP-проксі між «дитиною» і API), точки й SOS чекають у черзі й доходять після відновлення; батько підтверджує SOS. Код виходу 1 на першому провалі. Лише тестові дані.

### Етап 4. Батьківський застосунок

Потрібен Flutter 3.27+ і Android Studio або Xcode.

```bash
cd mobile
flutter pub get
flutter run --flavor parent -t lib/main_parent.dart \
  --dart-define=API_URL=http://10.0.2.2:3000 \
  --dart-define=MAP_TILE_KEY=<ключ MapTiler>
```

`10.0.2.2` це адреса комп'ютера з Android-емулятора. Для реального телефона вкажіть IP комп'ютера в локальній мережі. Увійдіть акаунтом зі `smoke.sh` або зареєструйтесь, і ви побачите дитину із симулятора на карті в реальному часі.

### Етап 5. Дитячий застосунок на телефоні

```bash
flutter run --flavor child -t lib/main_child.dart --dart-define=API_URL=http://<IP>:3000
```

Згода, далі скан QR-коду або ввід коду, далі дозвіл «Завжди» на геолокацію. У шторці з'явиться постійне сповіщення «Ділюся місцем із батьками». SOS: утримання 3 с, потім 5 с на скасування.

### Етап 6. Push-повідомлення через FCM

1. Створіть проєкт у Firebase, додайте Android-застосунки `ua.demoidity.de_moi_dity.parent` і `.child`, iOS-застосунки.
2. Покладіть `google-services.json` в `mobile/android/app/` і `GoogleService-Info.plist` у `mobile/ios/Runner/`, підключіть плагін `com.google.gms.google-services`.
3. У backend `.env`: `PUSH_DRIVER=fcm`, `FCM_SERVICE_ACCOUNT_B64=$(base64 -w0 service-account.json)`.

Без Firebase усе інше працює: застосунок отримує події через WebSocket, коли він відкритий.

## Що перевірено, а що ні (27.10.2026)

- Backend: 23 unit і 23 e2e тести (з них 5 на ізоляцію сімей) проходять на PostgreSQL 16 і Redis 7. `docker compose up` піднімає весь стек, `/health/ready` відповідає ok. `npm run scenario` проходить 13 з 13 кроків проти Docker-стека.
- Mobile: Flutter 3.47.8, `flutter analyze` без зауважень, 25 unit-тестів проходять.
- Не запускалось: збірка APK/IPA і робота на пристрої. У середовищі розробки немає доступу до Android SDK і Google Maven (dl.google.com). Кроки для Mac: `mobile/README.md`.
- Відомі обмеження MVP: без Firebase батьківський застосунок отримує SOS лише відкритим (через WebSocket); після перезавантаження телефона дитина має відкрити застосунок, щоб передача відновилась; у `npm audit` лишаються транзитивні залежності `firebase-admin` 13 (потрібне мажорне оновлення) і `zod` 3 (розбирає лише власні змінні середовища).
