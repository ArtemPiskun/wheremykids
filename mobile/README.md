# Mobile «Де мої діти»

Flutter, один код і два застосунки: `parent` (`lib/main_parent.dart`) і `child` (`lib/main_child.dart`). Android flavors дають різні applicationId, тож обидва можна поставити на один телефон.

```bash
flutter pub get
flutter run --flavor parent -t lib/main_parent.dart --dart-define=API_URL=http://10.0.2.2:3000 --dart-define=MAP_TILE_KEY=...
flutter run --flavor child  -t lib/main_child.dart  --dart-define=API_URL=http://10.0.2.2:3000
flutter test && flutter analyze
```

Параметри `--dart-define`: `API_URL`, `MAP_TILE_URL` (шаблон з `{z}/{x}/{y}` і `{key}`), `MAP_TILE_KEY`, `MAP_ATTRIBUTION`, `PRIVACY_URL`. Провайдер карти міняється через `MAP_TILE_URL` або нову реалізацію `AppMap` у `lib/core/map/app_map.dart`.

Для iOS у Xcode треба створити схеми `parent` і `child` (Flutter вимагає однойменні схеми для `--flavor`) або запускати без `--flavor`, лише з `-t`.

Debug-збірки дозволяють HTTP до локального API, release вимагає HTTPS.

## Геолокація

`lib/location/`: адаптивна політика (стоїть, іде, їде, burst після SOS або запиту батьків) з поправкою на заряд, фільтр Калмана й відсікання викидів, офлайн-черга в SQLite, пакетна синхронізація з експоненційним backoff. На Android працює foreground service з постійним сповіщенням, на iOS синій індикатор фонової геолокації. Дозвіл «Завжди» запитується лише після екрана згоди.
