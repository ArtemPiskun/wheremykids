# Мої діти — Android-застосунок

Flutter-застосунок з двома режимами: «Я батько або мати» і «Це телефон дитини».

## Запуск

```bash
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:8080   # емулятор + локальний сервер
```

## Пуші (Firebase)

Без Firebase застосунок працює, але без пушів. Щоб увімкнути:

1. Створіть проєкт у Firebase Console і додайте Android-застосунок `ua.moidity.moi_dity`.
2. Виконайте `flutterfire configure` (або покладіть `google-services.json` в `android/app/` і підключіть плагін `com.google.gms.google-services`).
3. Ключ сервісного акаунта покладіть на сервер (`GOOGLE_APPLICATION_CREDENTIALS`).

## Що всередині

- `lib/services/api.dart` — клієнт REST API сервера.
- `lib/services/location_tracker.dart` — фонове відстеження (foreground service з постійним сповіщенням), буфер точок на час блекауту.
- `lib/services/push.dart` — канали сповіщень: «Тривоги та SOS», «Події», «Гучний сигнал» (звучить як будильник).
- `lib/screens/parent/` — список дітей зі статусом тривоги, карта й маршрут, події, геозони.
- `lib/screens/child/` — статус тривоги в області, «Я в укритті», SOS.
