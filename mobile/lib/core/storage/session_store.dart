import 'package:flutter_secure_storage/flutter_secure_storage.dart';

enum UserRole { parent, child }

class Session {
  const Session({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.role,
    required this.deviceId,
    this.familyId,
  });

  final String accessToken;
  final String refreshToken;
  final String userId;
  final UserRole role;
  final String deviceId;
  final String? familyId;

  Session copyWith({String? accessToken, String? refreshToken, String? familyId}) => Session(
        accessToken: accessToken ?? this.accessToken,
        refreshToken: refreshToken ?? this.refreshToken,
        userId: userId,
        role: role,
        deviceId: deviceId,
        familyId: familyId ?? this.familyId,
      );
}

/// Tokens live in the Keychain / Android Keystore-backed storage, never in plain prefs.
class SessionStore {
  SessionStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
            );

  final FlutterSecureStorage _storage;
  static const _keys = ['access', 'refresh', 'user', 'role', 'device', 'family'];

  Future<Session?> read() async {
    final values = await _storage.readAll();
    final access = values['access'];
    final refresh = values['refresh'];
    final user = values['user'];
    final role = values['role'];
    final device = values['device'];
    if (access == null || refresh == null || user == null || role == null || device == null) return null;
    return Session(
      accessToken: access,
      refreshToken: refresh,
      userId: user,
      role: UserRole.values.byName(role),
      deviceId: device,
      familyId: values['family'],
    );
  }

  Future<void> write(Session s) async {
    await Future.wait([
      _storage.write(key: 'access', value: s.accessToken),
      _storage.write(key: 'refresh', value: s.refreshToken),
      _storage.write(key: 'user', value: s.userId),
      _storage.write(key: 'role', value: s.role.name),
      _storage.write(key: 'device', value: s.deviceId),
      if (s.familyId != null) _storage.write(key: 'family', value: s.familyId),
    ]);
  }

  Future<void> clear() => Future.wait(_keys.map((k) => _storage.delete(key: k)));
}
