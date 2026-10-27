import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../app/theme.dart';
import '../../../app/widgets/common.dart';
import '../../../core/l10n/formatters.dart';
import '../../../core/map/app_map.dart';
import '../../../l10n/app_localizations.dart';
import '../../family/application/family_controller.dart';
import '../../family/data/models.dart';

typedef _HistoryKey = ({String childId, DateTime from, DateTime to});

final _historyProvider = FutureProvider.autoDispose.family<HistoryResult, _HistoryKey>(
  (ref, k) => ref.read(familyRepositoryProvider).history(k.childId, k.from, k.to),
);

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key, required this.childId});
  final String childId;

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  final _map = AppMapController();
  int _dayOffset = 0;

  _HistoryKey get _key {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day).subtract(Duration(days: _dayOffset));
    final end = _dayOffset == 0 ? now : start.add(const Duration(days: 1));
    return (childId: widget.childId, from: start, to: end);
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final fmt = Fmt(Localizations.localeOf(context).toLanguageTag());
    final family = ref.watch(familyControllerProvider).valueOrNull;
    final child = family?.children.where((c) => c.id == widget.childId).firstOrNull;
    final historyDays = family?.family.historyDays ?? 1;
    final key = _key;
    final history = ref.watch(_historyProvider(key));

    ref.listen(_historyProvider(key), (_, next) {
      final points = next.valueOrNull?.points;
      if (points != null && points.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _map.fit([for (final p in points) p.point]));
      }
    });

    final days = [for (var i = 0; i < historyDays.clamp(1, 7); i++) i];
    return Scaffold(
      appBar: AppBar(title: Text(child == null ? s.historyTitle : '${s.historyTitle}: ${child.displayName}')),
      body: Column(children: [
        SizedBox(
          height: 56,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), children: [
            for (final d in days)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(d == 0 ? s.today : d == 1 ? s.yesterday : fmt.date(DateTime.now().subtract(Duration(days: d)))),
                  selected: d == _dayOffset,
                  onSelected: (_) => setState(() => _dayOffset = d),
                ),
              ),
          ]),
        ),
        if (historyDays <= 1)
          Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(s.historyLimited, style: Theme.of(context).textTheme.bodySmall)),
        Expanded(
          child: history.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text(errorText(context, e))),
            data: (h) {
              if (h.points.isEmpty) return Center(child: Text(s.noPoints));
              final first = h.points.first;
              final last = h.points.last;
              return Stack(children: [
                AppMap(
                  controller: _map,
                  initialCenter: last.point,
                  initialZoom: 14,
                  routes: [MapRoute(points: [for (final p in h.points) p.point], color: AppColors.trust)],
                  pins: [
                    MapPin(id: 'start', point: first.point, size: 28, child: const Icon(Icons.trip_origin, color: AppColors.online)),
                    for (final p in h.points.where((p) => p.source == 'sos'))
                      MapPin(id: 'sos-${p.recordedAt.millisecondsSinceEpoch}', point: p.point, size: 28, child: const Icon(Icons.sos, color: AppColors.sos)),
                    MapPin(id: 'end', point: last.point, size: 32, child: const Icon(Icons.location_on, color: AppColors.trust, size: 32)),
                  ],
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text('${fmt.time(first.recordedAt)} – ${fmt.time(last.recordedAt)} · ${h.points.length}', textAlign: TextAlign.center),
                    ),
                  ),
                ),
              ]);
            },
          ),
        ),
      ]),
    );
  }
}
