import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/theme.dart';
import '../../../app/widgets/common.dart';
import '../../../core/l10n/formatters.dart';
import '../../../core/map/app_map.dart';
import '../../../l10n/app_localizations.dart';
import '../../family/application/family_controller.dart';
import '../application/sos_controller.dart';

/// Full-screen alert: where, when, battery, last 30 minutes of route, and what to do next.
class SosAlertScreen extends ConsumerWidget {
  const SosAlertScreen({super.key, required this.sosId});
  final String sosId;

  Future<void> _call112(BuildContext context) async {
    final s = S.of(context);
    // Never dial emergency services without an explicit confirmation.
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.local_police_outlined),
        content: Text(s.sosCall112Confirm),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.no)),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: AppColors.sos), onPressed: () => Navigator.pop(ctx, true), child: Text(s.yesCall)),
        ],
      ),
    );
    if (ok == true) await launchUrl(Uri(scheme: 'tel', path: '112'));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final fmt = Fmt(Localizations.localeOf(context).toLanguageTag());
    final alert = ref.watch(sosControllerProvider).where((a) => a.id == sosId).firstOrNull;
    final children = ref.watch(familyControllerProvider).valueOrNull?.children ?? const [];
    if (alert == null) {
      return Scaffold(appBar: AppBar(), body: Center(child: Text(s.sosResolve)));
    }
    final child = children.where((c) => c.id == alert.childId).firstOrNull;
    final name = alert.childName ?? child?.displayName ?? '';
    final phone = alert.childPhone ?? child?.phone;
    final point = alert.location ?? child?.location?.point;
    final map = AppMapController();

    return Scaffold(
      backgroundColor: AppColors.sos,
      appBar: AppBar(backgroundColor: AppColors.sos, foregroundColor: Colors.white, title: Text(s.sosTitle(name))),
      body: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: DefaultTextStyle(
              style: const TextStyle(color: Colors.white, fontSize: 16),
              child: Wrap(spacing: 16, runSpacing: 4, children: [
                Text(s.sosAt(fmt.time(alert.createdAt))),
                if (alert.battery != null) Text(s.sosBattery(alert.battery!)),
                if (alert.acknowledgedByName != null) Text(s.sosAcknowledgedBy(alert.acknowledgedByName!)),
              ]),
            ),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: point == null
                  ? Container(color: Colors.white, alignment: Alignment.center, child: Text(s.noLocationYet))
                  : AppMap(
                      controller: map,
                      initialCenter: point,
                      initialZoom: 16,
                      routes: [if (alert.route.length > 1) MapRoute(points: alert.route, color: AppColors.sos, width: 5)],
                      pins: [MapPin(id: alert.childId, point: point, child: ChildAvatar(name: name, id: alert.childId))],
                    ),
            ),
          ),
          if (alert.location == null && point != null)
            Padding(padding: const EdgeInsets.all(8), child: Text(s.sosNoLocation, style: const TextStyle(color: Colors.white))),
          if (alert.route.length > 1)
            Padding(padding: const EdgeInsets.only(top: 8, left: 16), child: Text(s.sosRoute, style: const TextStyle(color: Colors.white70))),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              Row(children: [
                if (phone != null)
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.sos),
                      onPressed: () => launchUrl(Uri(scheme: 'tel', path: phone)),
                      icon: const Icon(Icons.call),
                      label: Text(s.call),
                    ),
                  ),
                if (phone != null) const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: Colors.black87),
                    onPressed: alert.status == 'active'
                        ? () async {
                            try {
                              await ref.read(sosControllerProvider.notifier).acknowledge(alert.id);
                            } catch (e) {
                              if (context.mounted) showError(context, e);
                            }
                          }
                        : null,
                    icon: const Icon(Icons.visibility),
                    label: Text(s.sosAck),
                  ),
                ),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white)),
                    onPressed: () => _call112(context),
                    icon: const Icon(Icons.emergency_outlined),
                    label: Text(s.sosCall112),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white)),
                    onPressed: () async {
                      try {
                        await ref.read(sosControllerProvider.notifier).resolve(alert.id);
                        if (context.mounted) Navigator.of(context).maybePop();
                      } catch (e) {
                        if (context.mounted) showError(context, e);
                      }
                    },
                    child: Text(s.sosResolve),
                  ),
                ),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}
