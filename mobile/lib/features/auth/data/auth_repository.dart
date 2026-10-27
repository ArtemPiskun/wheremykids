import '../../../core/config/env.dart';
import '../../../core/device/device_info.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/session_store.dart';

typedef Json = Map<String, dynamic>;

class AuthRepository {
  AuthRepository(this.api);
  final ApiClient api;

  Future<Session> register({required String email, required String password, required String name, required String locale}) async {
    final res = await api.post<Json>('/v1/auth/register', {
      'email': email,
      'password': password,
      'displayName': name,
      'locale': locale,
      'acceptPrivacyPolicy': true,
      'device': await describeDevice(),
    });
    return _store(res, UserRole.parent);
  }

  Future<Session> login({required String email, required String password}) async {
    final res = await api.post<Json>('/v1/auth/login', {'email': email, 'password': password, 'device': await describeDevice()});
    return _store(res, UserRole.parent);
  }

  /// Child onboarding: the invite code is the only credential the child ever needs.
  Future<Session> redeemInvite(String code) async {
    final res = await api.post<Json>('/v1/invites/redeem', {
      'code': code,
      'device': await describeDevice(),
      'consent': {'locationSharing': true, 'version': Env.privacyPolicyVersion},
    });
    return _store(res, UserRole.child, familyId: res['familyId'] as String?);
  }

  Future<void> logout() async {
    try {
      await api.post<void>('/v1/auth/logout');
    } finally {
      await api.clearSession();
    }
  }

  Future<Session> _store(Json res, UserRole role, {String? familyId}) async {
    final session = Session(
      accessToken: res['accessToken'] as String,
      refreshToken: res['refreshToken'] as String,
      userId: (res['user'] as Map)['id'] as String,
      role: role,
      deviceId: res['deviceId'] as String,
      familyId: familyId,
    );
    await api.setSession(session);
    return session;
  }
}
