import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/realtime/events.dart';
import '../../family/application/family_controller.dart';
import '../../family/data/models.dart';

/// Open SOS alerts for the parent's family. A new alert opens the full-screen SOS view.
class SosController extends Notifier<List<SosAlert>> {
  StreamSubscription<RtEvent>? _sub;

  @override
  List<SosAlert> build() {
    final familyId = ref.watch(familyControllerProvider.select((s) => s.valueOrNull?.family.id));
    _sub?.cancel();
    if (familyId == null) return const [];
    _sub = ref.read(realtimeProvider).events.where((e) => e.name == RtEvents.sosRaised || e.name == RtEvents.sosUpdated).listen(_onEvent);
    ref.onDispose(() => _sub?.cancel());
    unawaited(_load(familyId));
    return const [];
  }

  Future<void> _load(String familyId) async {
    try {
      final alerts = await ref.read(familyRepositoryProvider).openAlerts(familyId);
      state = alerts.where((a) => a.open).toList();
    } catch (_) {
      // Realtime events still arrive; the list refreshes on the next family reload.
    }
  }

  void _onEvent(RtEvent e) {
    final incoming = SosAlert.fromJson(e.data);
    final existing = state.where((a) => a.id == incoming.id).firstOrNull;
    final merged = existing == null
        ? incoming
        : SosAlert(
            id: incoming.id,
            childId: incoming.childId,
            status: incoming.status,
            createdAt: incoming.createdAt,
            battery: incoming.battery ?? existing.battery,
            location: incoming.location ?? existing.location,
            route: incoming.route.isNotEmpty ? incoming.route : existing.route,
            childName: incoming.childName ?? existing.childName,
            childPhone: incoming.childPhone ?? existing.childPhone,
            acknowledgedByName: incoming.acknowledgedByName ?? existing.acknowledgedByName,
          );
    state = [
      for (final a in state)
        if (a.id != merged.id) a,
      if (merged.open) merged,
    ];
  }

  Future<void> acknowledge(String id) async => _replace(await ref.read(familyRepositoryProvider).acknowledge(id));
  Future<void> resolve(String id) async => _replace(await ref.read(familyRepositoryProvider).resolve(id));

  void _replace(SosAlert updated) {
    state = [
      for (final a in state)
        if (a.id != updated.id) a else if (updated.open) SosAlert(
            id: a.id,
            childId: a.childId,
            status: updated.status,
            createdAt: a.createdAt,
            battery: a.battery,
            location: a.location,
            route: a.route,
            childName: a.childName,
            childPhone: a.childPhone,
            acknowledgedByName: updated.acknowledgedByName ?? a.acknowledgedByName,
          ),
    ];
  }
}

final sosControllerProvider = NotifierProvider<SosController, List<SosAlert>>(SosController.new);
