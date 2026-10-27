import 'package:battery_plus/battery_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/network/api_client.dart';
import '../core/push/push_service.dart';
import '../core/realtime/realtime_client.dart';
import '../core/storage/session_store.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/child_home/data/child_repository.dart';
import '../features/family/data/family_repository.dart';
import '../location/tracking_policy.dart';
import 'flavor.dart';

/// Overridden in main_parent.dart / main_child.dart.
final flavorProvider = Provider<AppFlavor>((_) => throw UnimplementedError('flavorProvider must be overridden'));

/// Signed-in state; `null` = signed out. Set by [AuthController].
final sessionProvider = StateProvider<Session?>((_) => null);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    store: SessionStore(),
    onSessionExpired: () async => ref.read(sessionProvider.notifier).state = null,
  );
});

final realtimeProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient(ref.watch(apiClientProvider));
  ref.onDispose(client.disconnect);
  return client;
});

final pushServiceProvider = Provider<PushService>((ref) => PushService(ref.watch(apiClientProvider)));

final authRepositoryProvider = Provider((ref) => AuthRepository(ref.watch(apiClientProvider)));
final familyRepositoryProvider = Provider((ref) => FamilyRepository(ref.watch(apiClientProvider)));
final childRepositoryProvider = Provider((ref) => ChildRepository(ref.watch(apiClientProvider)));

final _battery = Battery();

Future<PowerState> readPowerState() async {
  try {
    final level = await _battery.batteryLevel;
    final state = await _battery.batteryState;
    final saver = await _battery.isInBatterySaveMode;
    return PowerState(batteryLevel: level, charging: state == BatteryState.charging || state == BatteryState.full, powerSaveMode: saver);
  } catch (_) {
    return PowerState.unknown;
  }
}
