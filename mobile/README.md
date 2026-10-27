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

Debug-збірки дозволяють HTTP до локального API, release вимагає HTTPS: release-збірка не стартує з `API_URL` не на `https://` або без `MAP_TILE_KEY`. У debug без `MAP_TILE_KEY` карта бере публічні тайли OpenStreetMap (лише для розробки).

## Збірка Android на Mac

1. Flutter 3.27+ (перевірено на 3.47.8): `brew install --cask flutter`, потім `flutter doctor`.
2. Android Studio: `brew install --cask android-studio`. У SDK Manager поставте Android SDK Platform (остання), Build-Tools, Command-line Tools і Platform-Tools. Далі `flutter doctor --android-licenses`.
3. Проєкт використовує AGP 9.1, Gradle 9.3 і Kotlin 2.4, тож потрібна свіжа Android Studio з JDK 17+ (вбудований JBR підходить; за потреби `flutter config --jdk-dir "/Applications/Android Studio.app/Contents/jbr/Contents/Home"`).
4. Збірка обох застосунків:

```bash
cd mobile
flutter pub get
flutter build apk --debug --flavor parent -t lib/main_parent.dart --dart-define=API_URL=http://10.0.2.2:3000
flutter build apk --debug --flavor child  -t lib/main_child.dart  --dart-define=API_URL=http://10.0.2.2:3000
# APK: build/app/outputs/flutter-apk/app-parent-debug.apk і app-child-debug.apk
```

5. Емулятор: `flutter emulators --launch <id>`, далі `flutter run` з тими ж параметрами. Обидва застосунки ставляться на один пристрій (різні applicationId). Для реального телефона в тій самій Wi-Fi мережі: `API_URL=http://<IP вашого Mac>:3000` (`ipconfig getifaddr en0`).
6. Перевірка: на дитячому телефоні після дозволу «Завжди» у шторці має бути постійне сповіщення «Ділюся місцем із батьками». Увімкніть режим польоту на хвилину, вимкніть: точки з черги мають дійти до батька одразу після появи мережі.

### Підпис release

```bash
keytool -genkey -v -keystore ~/demoidity-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Створіть `mobile/android/key.properties` (в git не потрапляє):

```properties
storeFile=/Users/<you>/demoidity-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

Без цього файлу release-APK підписується debug-ключем: його можна поставити локально, але не можна завантажувати в Google Play.

### Дозволи за flavor

`src/main/AndroidManifest.xml` спільний (мережа, сповіщення). Геолокація (у тому числі фонова), foreground service типу `location` і камера оголошені лише в `src/child/AndroidManifest.xml`. `src/parent/AndroidManifest.xml` прибирає те, що підмішують плагіни geolocator і mobile_scanner, тож батьківський застосунок не просить ні геолокацію, ні камеру.

## Геолокація

`lib/location/`: адаптивна політика (стоїть, іде, їде, burst після SOS або запиту батьків) з поправкою на заряд, фільтр Калмана й відсікання викидів, офлайн-черга в SQLite, пакетна синхронізація з експоненційним backoff. На Android працює foreground service з постійним сповіщенням, на iOS синій індикатор фонової геолокації. Дозвіл «Завжди» запитується лише після екрана згоди.
