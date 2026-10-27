import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/providers.dart';
import '../../../app/theme.dart';
import '../../../app/widgets/common.dart';
import '../../../core/l10n/formatters.dart';
import '../../../core/map/app_map.dart';
import '../../../l10n/app_localizations.dart';
import '../../family/application/family_controller.dart';
import '../../family/data/models.dart';
import '../../sos/application/sos_controller.dart';

/// Main parent screen: full-screen map, children list in a bottom sheet.
class ParentHomeScreen extends ConsumerStatefulWidget {
  const ParentHomeScreen({super.key});

  @override
  ConsumerState<ParentHomeScreen> createState() => _ParentHomeScreenState();
}

class _ParentHomeScreenState extends ConsumerState<ParentHomeScreen> {
  final _map = AppMapController();
  final _shownAlerts = <String>{};
  bool _fitted = false;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final family = ref.watch(familyControllerProvider).valueOrNull;

    ref.listen<List<SosAlert>>(sosControllerProvider, (_, alerts) {
      for (final a in alerts) {
        if (a.status == 'active' && _shownAlerts.add(a.id)) context.push('/sos/${a.id}');
      }
    });

    if (family == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final located = family.children.where((c) => c.location != null).toList();
    if (!_fitted && located.isNotEmpty) {
      _fitted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _map.fit([for (final c in located) c.location!.point]));
    }

    return Scaffold(
      body: Stack(children: [
        AppMap(
          controller: _map,
          pins: [
            for (final c in located)
              MapPin(id: c.id, point: c.location!.point, child: _ChildPin(child: c)),
          ],
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Spacer(),
                _RoundButton(icon: Icons.shield_outlined, tooltip: s.zones, onTap: () => context.push('/zones')),
                const SizedBox(width: 8),
                _RoundButton(icon: Icons.settings_outlined, tooltip: s.settings, onTap: () => context.push('/settings')),
              ]),
              if (!family.live) ...[
                const SizedBox(height: 8),
                _StaleBanner(text: s.dataAsOf(Fmt(Localizations.localeOf(context).toLanguageTag()).shortStamp(family.syncedAt))),
              ],
            ]),
          ),
        ),
        DraggableScrollableSheet(
          initialChildSize: 0.32,
          minChildSize: 0.16,
          maxChildSize: 0.8,
          builder: (context, scroll) => Material(
            elevation: 8,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            child: RefreshIndicator(
              onRefresh: () => ref.read(familyControllerProvider.notifier).refresh(),
              child: ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
                Center(child: Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: 12), decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(2)))),
                if (family.children.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 16), child: Text(s.noChildren, textAlign: TextAlign.center)),
                for (final c in family.children)
                  _ChildCard(
                    child: c,
                    onFocus: c.location == null ? null : () => _map.moveTo(c.location!.point),
                  ),
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: () => context.push('/children/new'), icon: const Icon(Icons.person_add_alt), label: Text(s.addChild)),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

class _ChildPin extends StatelessWidget {
  const _ChildPin({required this.child});
  final ChildSummary child;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Column(mainAxisSize: MainAxisSize.min, children: [
      ChildAvatar(name: child.displayName, id: child.id, status: child.status),
      const SizedBox(height: 2),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(8), boxShadow: const [BoxShadow(blurRadius: 2, color: Colors.black26)]),
        child: Text(
          '${child.displayName} · ${agoLabel(s, child.location!.recordedAt)}',
          style: const TextStyle(fontSize: 11),
          overflow: TextOverflow.ellipsis,
        ),
      ),
    ]);
  }
}

class _ChildCard extends ConsumerWidget {
  const _ChildCard({required this.child, this.onFocus});
  final ChildSummary child;
  final VoidCallback? onFocus;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final loc = child.location;
    final subtitle = <String>[
      statusLabel(s, child.status),
      if (loc != null) agoLabel(s, loc.recordedAt) else if (child.connected) s.noLocationYet else s.notConnected,
    ].join(' · ');

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onFocus,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              ChildAvatar(name: child.displayName, id: child.id, status: child.status, size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(child.displayName, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                  Text(subtitle, style: theme.textTheme.bodySmall?.copyWith(color: statusColor(child.status))),
                ]),
              ),
              if (child.battery != null) BatteryLabel(level: child.battery!, charging: child.charging),
            ]),
            const SizedBox(height: 10),
            if (!child.connected)
              FilledButton.tonalIcon(onPressed: () => context.push('/children/${child.id}/invite'), icon: const Icon(Icons.qr_code), label: Text(s.connectPhone))
            else
              Wrap(spacing: 8, runSpacing: 8, children: [
                _Action(icon: Icons.route, label: s.history, onTap: () => context.push('/children/${child.id}/history')),
                if (child.phone != null)
                  _Action(icon: Icons.call, label: s.call, onTap: () => launchUrl(Uri(scheme: 'tel', path: child.phone))),
                _Action(
                  icon: Icons.my_location,
                  label: s.updateNow,
                  onTap: () async {
                    try {
                      await ref.read(familyRepositoryProvider).locate(child.id);
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.updateRequested)));
                    } catch (e) {
                      if (context.mounted) showError(context, e);
                    }
                  },
                ),
              ]),
          ]),
        ),
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ActionChip(avatar: Icon(icon, size: 18), label: Text(label), onPressed: onTap);
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.tooltip, required this.onTap});
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        shape: const CircleBorder(),
        elevation: 3,
        color: Theme.of(context).colorScheme.surface,
        child: IconButton(icon: Icon(icon), tooltip: tooltip, onPressed: onTap),
      );
}

class _StaleBanner extends StatelessWidget {
  const _StaleBanner({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.sun,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(children: [const Icon(Icons.cloud_off, size: 18, color: Colors.black87), const SizedBox(width: 8), Expanded(child: Text(text, style: const TextStyle(color: Colors.black87)))]),
        ),
      );
}
