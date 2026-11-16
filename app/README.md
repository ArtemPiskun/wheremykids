# Мої діти — Android-застосунок

Flutter-застосунок з двома режимами: «Я батько або мати» і «Це телефон дитини».

## Запуск

```bash
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:8080   # емулятор + локальний сервер
```

## APK з GitHub Actions

Workflow `.github/workflows/android-apk.yml` збирає APK при кожному пуші в `main` і в pull request'ах,
що змінюють `app/`. Готовий файл: вкладка **Actions** → потрібний запуск → **Artifacts** → `moi-dity-apk`
(зберігається 30 днів). Зібрати вручну з іншою адресою сервера: **Actions → Android APK → Run workflow**, поле `api_url`.

Налаштування в **Settings → Secrets and variables → Actions**:

- секрет `GOOGLE_SERVICES_JSON` — вміст `google-services.json` (без нього APK без пушів);
- змінна `API_URL` — адреса сервера за замовчуванням (інакше `http://10.0.2.2:8080`, тобто емулятор).

Release-збірка поки підписана debug-ключем: її можна встановити на телефон, але не в Google Play.

## Пуші (Firebase, проєкт `my-kids-1f72d`)

1. Firebase Console → Project settings → General → **Add app → Android**, package name `ua.moidity.moi_dity`
   (SHA-1 для пушів не потрібен).
2. Завантажте **google-services.json** і покладіть у `android/app/google-services.json`.
   Gradle підключить плагін Google Services автоматично, коли файл на місці.
3. Ключ сервера — див. `server/README` / кореневий README.

Без `google-services.json` застосунок збирається й працює, але без пушів.

## Що всередині

- `lib/services/api.dart` — клієнт REST API сервера.
- `lib/services/location_tracker.dart` — фонове відстеження (foreground service з постійним сповіщенням), буфер точок на час блекауту.
- `lib/services/push.dart` — канали сповіщень: «Тривоги та SOS», «Події», «Гучний сигнал» (звучить як будильник).
- `lib/screens/parent/` — список дітей зі статусом тривоги, карта й маршрут, події, геозони.
- `lib/screens/child/` — статус тривоги в області, «Я в укритті», SOS.
