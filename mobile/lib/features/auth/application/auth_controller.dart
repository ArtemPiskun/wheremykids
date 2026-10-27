import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/storage/session_store.dart';

/// Owns sign-in/sign-out and wires the realtime connection and push token to the session.
class AuthController {
  AuthController(this.ref);
  final Ref ref;

  Future<void> bootstrap() async {
    final session = await ref.read(apiClientProvider).restore();
    _activate(session);
    unawaited(ref.read(pushServiceProvider).init().then((_) => session == null ? null : ref.read(pushServiceProvider).registerToken()));
  }

  Future<void> signIn(String email, String password) async =>
      _activate(await ref.read(authRepositoryProvider).login(email: email, password: password));

  Future<void> signUp(String email, String password, String name, String locale) async =>
      _activate(await ref.read(authRepositoryProvider).register(email: email, password: password, name: name, locale: locale));

  Future<void> redeemInvite(String code) async => _activate(await ref.read(authRepositoryProvider).redeemInvite(code));

  Future<void> signOut() async {
    ref.read(realtimeProvider).disconnect();
    await ref.read(authRepositoryProvider).logout();
    ref.read(sessionProvider.notifier).state = null;
  }

  /// Local-only sign-out after the server already revoked this device (e.g. the child left).
  Future<void> forget() async {
    ref.read(realtimeProvider).disconnect();
    await ref.read(apiClientProvider).clearSession();
    ref.read(sessionProvider.notifier).state = null;
  }

  void _activate(Session? session) {
    ref.read(sessionProvider.notifier).state = session;
    if (session == null) return;
    ref.read(realtimeProvider).connect();
    unawaited(ref.read(pushServiceProvider).registerToken());
  }
}

final authControllerProvider = Provider(AuthController.new);
