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

Варіант через Docker: `docker compose up --build` у `backend/` (Postgres, Redis, міграції, API). Секрети все одно беруться з `.env`.

### Етап 2. API вручну: сім'я, дитина, інвайт, зона

```bash
npm start                              # API на :3000, push-повідомлення друкуються в лог
./scripts/smoke.sh                     # реєстрація батька, сім'я, дитина, зона «Дім», код інвайту
```

### Етап 3. Симулятор дитини: маршрут, зони, SOS

```bash
npm run simulate:child -- --code XXXX-XXXX --interval 5 --sos-after 3
```

Симулятор погашає інвайт (зі згодою), ходить маршрутом біля Золотих воріт у Києві, проходить через зону «Дім» і на третьому пакеті піднімає SOS. У лозі API видно push «Марко — у зоні «Дім»», «Марко — поза зоною «Дім»» і SOS. Останні координати: `GET /v1/families/{id}/locations/latest`.

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

## Що перевірено, а що ні

- Backend: 23 unit і 18 e2e тестів проходять на PostgreSQL 16 і Redis 7. `smoke.sh` і симулятор пройдені вручну.
- Mobile: `flutter analyze` без зауважень, 23 unit-тести (політика GPS, детектор руху, фільтр Калмана, офлайн-черга, синхронізація, форматування) проходять.
- Не запускалось: збірка APK/IPA і робота на реальному пристрої (у середовищі розробки немає Android SDK і Xcode), `docker compose` (немає Docker). Ці кроки варто пройти першими.
