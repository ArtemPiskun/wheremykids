import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../app/theme.dart';
import '../../../app/widgets/common.dart';
import '../../../core/map/app_map.dart';
import '../../../l10n/app_localizations.dart';
import '../../family/application/family_controller.dart';
import '../../family/data/models.dart';

final geofencesProvider = FutureProvider.autoDispose<List<Geofence>>((ref) async {
  final familyId = ref.watch(familyControllerProvider.select((s) => s.valueOrNull?.family.id));
  if (familyId == null) return const [];
  return ref.read(familyRepositoryProvider).geofences(familyId);
});

String zoneKindLabel(S s, ZoneKind k) => switch (k) {
      ZoneKind.home => s.zoneHome,
      ZoneKind.school => s.zoneSchool,
      ZoneKind.sport => s.zoneSport,
      ZoneKind.other => s.zoneOther,
    };

IconData zoneIcon(ZoneKind k) => switch (k) {
      ZoneKind.home => Icons.home_outlined,
      ZoneKind.school => Icons.school_outlined,
      ZoneKind.sport => Icons.sports_soccer,
      ZoneKind.other => Icons.place_outlined,
    };

class GeofencesScreen extends ConsumerStatefulWidget {
  const GeofencesScreen({super.key});

  @override
  ConsumerState<GeofencesScreen> createState() => _GeofencesScreenState();
}

class _GeofencesScreenState extends ConsumerState<GeofencesScreen> {
  final _map = AppMapController();
  LatLng? _draftCenter;
  int _draftRadius = 150;
  ZoneKind _draftKind = ZoneKind.home;
  final _draftName = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _draftName.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final familyId = ref.read(familyControllerProvider).valueOrNull?.family.id;
    final center = _draftCenter;
    if (familyId == null || center == null) return;
    final s = S.of(context);
    setState(() => _busy = true);
    try {
      await ref.read(familyRepositoryProvider).createGeofence(
            familyId,
            name: _draftName.text.trim().isEmpty ? zoneKindLabel(s, _draftKind) : _draftName.text.trim(),
            kind: _draftKind,
            lat: center.latitude,
            lng: center.longitude,
            radiusM: _draftRadius,
          );
      ref.invalidate(geofencesProvider);
      setState(() {
        _draftCenter = null;
        _draftName.clear();
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(Geofence g) async {
    final familyId = ref.read(familyControllerProvider).valueOrNull?.family.id;
    if (familyId == null) return;
    try {
      await ref.read(familyRepositoryProvider).deleteGeofence(familyId, g.id);
      ref.invalidate(geofencesProvider);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final zones = ref.watch(geofencesProvider);
    final children = ref.watch(familyControllerProvider).valueOrNull?.children ?? const [];
    final childPoint = children.map((c) => c.location?.point).whereType<LatLng>().firstOrNull;

    return Scaffold(
      appBar: AppBar(title: Text(s.zonesTitle)),
      body: Column(children: [
        Expanded(
          flex: 3,
          child: AppMap(
            controller: _map,
            initialCenter: childPoint ?? kyiv,
            initialZoom: 14,
            onTap: (p) => setState(() => _draftCenter = p),
            zones: [
              for (final g in zones.valueOrNull ?? const <Geofence>[]) MapZone(center: g.center, radiusM: g.radiusM.toDouble(), color: AppColors.trust),
              if (_draftCenter != null) MapZone(center: _draftCenter!, radiusM: _draftRadius.toDouble(), color: AppColors.sun),
            ],
          ),
        ),
        Expanded(
          flex: 2,
          child: _draftCenter != null
              ? ListView(padding: const EdgeInsets.all(16), children: [
                  SegmentedButton<ZoneKind>(
                    segments: [for (final k in ZoneKind.values) ButtonSegment(value: k, icon: Icon(zoneIcon(k)), label: Text(zoneKindLabel(s, k)))],
                    selected: {_draftKind},
                    onSelectionChanged: (v) => setState(() => _draftKind = v.first),
                    showSelectedIcon: false,
                  ),
                  const SizedBox(height: 12),
                  TextField(controller: _draftName, decoration: InputDecoration(labelText: s.zoneName, hintText: zoneKindLabel(s, _draftKind))),
                  const SizedBox(height: 8),
                  Text(s.radius(_draftRadius)),
                  Slider(value: _draftRadius.toDouble(), min: 50, max: 1000, divisions: 19, onChanged: (v) => setState(() => _draftRadius = v.round())),
                  Row(children: [
                    Expanded(child: OutlinedButton(onPressed: () => setState(() => _draftCenter = null), child: Text(s.cancel))),
                    const SizedBox(width: 12),
                    Expanded(child: FilledButton(onPressed: _busy ? null : _save, child: Text(s.save))),
                  ]),
                ])
              : zones.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(child: Text(errorText(context, e))),
                  data: (list) => ListView(children: [
                    ListTile(leading: const Icon(Icons.touch_app_outlined), title: Text(list.isEmpty ? s.noZones : s.tapMapToPlace)),
                    for (final g in list)
                      ListTile(
                        leading: Icon(zoneIcon(g.kind)),
                        title: Text(g.name),
                        subtitle: Text(s.radius(g.radiusM)),
                        onTap: () => _map.moveTo(g.center),
                        trailing: IconButton(icon: const Icon(Icons.delete_outline), tooltip: s.delete, onPressed: () => _delete(g)),
                      ),
                  ]),
                ),
        ),
      ]),
    );
  }
}
