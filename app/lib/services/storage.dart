import 'package:shared_preferences/shared_preferences.dart';

enum Role { parent, child }

/// Локальні налаштування: роль пристрою, токен і адреса сервера.
class Storage {
  Storage(this._prefs);
  final SharedPreferences _prefs;

  static Future<Storage> open() async => Storage(await SharedPreferences.getInstance());

  // Адресу сервера задають при збірці: --dart-define=API_URL=https://...
  static const defaultApiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080');

  String get apiUrl => _prefs.getString('apiUrl') ?? defaultApiUrl;
  String? get token => _prefs.getString('token');
  Role? get role => switch (_prefs.getString('role')) {
        'parent' => Role.parent,
        'child' => Role.child,
        _ => null,
      };
  String? get childName => _prefs.getString('childName');

  Future<void> saveSession(Role role, String token, {String? childName}) async {
    await _prefs.setString('role', role.name);
    await _prefs.setString('token', token);
    if (childName != null) await _prefs.setString('childName', childName);
  }

  Future<void> clear() async {
    await _prefs.remove('role');
    await _prefs.remove('token');
    await _prefs.remove('childName');
    await _prefs.remove('pendingPoints');
  }

  /// Точки, які не вдалося надіслати (немає зв'язку, блекаут).
  List<String> get pendingPoints => _prefs.getStringList('pendingPoints') ?? const [];
  Future<void> setPendingPoints(List<String> points) => _prefs.setStringList('pendingPoints', points);
}
