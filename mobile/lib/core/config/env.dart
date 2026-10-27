/// Build-time configuration, passed with `--dart-define` (see mobile/README.md).
/// Nothing secret lives here: API keys for tiles are restricted to the app's bundle id.
class Env {
  const Env._();

  /// 10.0.2.2 is the host machine from the Android emulator.
  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:3000');

  /// XYZ tile template. Production uses MapTiler (or a self-hosted OpenMapTiles server);
  /// the public OSM servers must not be used by a commercial app.
  static const mapTileUrl = String.fromEnvironment(
    'MAP_TILE_URL',
    defaultValue: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key={key}',
  );
  static const mapTileKey = String.fromEnvironment('MAP_TILE_KEY');
  static const mapAttribution = String.fromEnvironment('MAP_ATTRIBUTION', defaultValue: '© MapTiler © OpenStreetMap contributors');

  static const privacyPolicyVersion = '2026-10';
  static const privacyPolicyUrl = String.fromEnvironment('PRIVACY_URL', defaultValue: 'https://demoidity.ua/privacy');

  static String get tileUrl => mapTileUrl.replaceAll('{key}', mapTileKey);
}
