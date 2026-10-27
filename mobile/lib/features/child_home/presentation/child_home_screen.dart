import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/theme.dart';
import '../../../app/widgets/common.dart';
import '../../../core/l10n/formatters.dart';
import '../../../l10n/app_localizations.dart';
import '../../../location/location_engine.dart';
import '../application/child_controller.dart';
import 'sos_button.dart';

class ChildHomeScreen extends ConsumerStatefulWidget {
  const ChildHomeScreen({super.key});

  @override
  ConsumerState<ChildHomeScreen> createState() => _ChildHomeScreenState();
}

class _ChildHomeScreenState extends ConsumerState<ChildHomeScreen> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) ref.read(childControllerProvider.notifier).onAppResumed();
  }

  Future<void> _confirmLeave() async {
    final s = S.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(s.leaveConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.cancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.leave)),
        ],
      ),
    );
    if (ok == true) {
      try {
        await ref.read(childControllerProvider.notifier).leave();
      } catch (e) {
        if (mounted) showError(context, e);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final async = ref.watch(childControllerProvider);
    return Scaffold(
      appBar: AppBar(title: Text(s.childAppTitle)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(errorText(context, e)),
            TextButton(onPressed: () => ref.invalidate(childControllerProvider), child: Text(s.retry)),
          ]),
        ),
        data: (state) => _Body(state: state, onLeave: _confirmLeave),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.state, required this.onLeave});
  final ChildState state;
  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final theme = Theme.of(context);
    final controller = ref.read(childControllerProvider.notifier);
    final fmt = Fmt(Localizations.localeOf(context).toLanguageTag());
    final profile = state.profile;

    return ListView(padding: const EdgeInsets.all(20), children: [
      if (state.access != LocationAccess.always) _PermissionCard(access: state.access, onGrant: controller.requestPermission),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(profile.paused ? Icons.pause_circle : Icons.location_on, color: profile.paused ? AppColors.sun : AppColors.online),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  profile.paused ? s.pausedUntil(fmt.time(profile.pausedUntil!)) : s.sharingOn,
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              Icon(state.connected ? Icons.cloud_done_outlined : Icons.cloud_off_outlined, color: state.connected ? AppColors.online : AppColors.offline),
            ]),
            if (state.pending > 0 && !state.connected) Padding(padding: const EdgeInsets.only(top: 8), child: Text(s.pendingPoints(state.pending))),
            const Divider(height: 24),
            Text(s.parentsSee, style: theme.textTheme.bodySmall),
            const SizedBox(height: 6),
            Wrap(spacing: 8, runSpacing: 8, children: [for (final p in profile.parents) Chip(avatar: const Icon(Icons.person, size: 18), label: Text(p))]),
          ]),
        ),
      ),
      const SizedBox(height: 24),
      Center(child: _SosArea(state: state)),
      const SizedBox(height: 24),
      FilledButton.tonalIcon(
        onPressed: profile.paused ? null : controller.shareNow,
        icon: const Icon(Icons.send),
        label: Text(state.lastShared != null && DateTime.now().difference(state.lastShared!) < const Duration(seconds: 30) ? s.sent : s.sendLocation),
      ),
      const SizedBox(height: 12),
      if (profile.canPause)
        OutlinedButton(onPressed: profile.paused ? controller.resume : controller.pause, child: Text(profile.paused ? s.resume : s.pauseHour)),
      const SizedBox(height: 32),
      TextButton(onPressed: onLeave, child: Text(s.leaveFamily, style: TextStyle(color: theme.colorScheme.error))),
    ]);
  }
}

class _SosArea extends ConsumerWidget {
  const _SosArea({required this.state});
  final ChildState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    final controller = ref.read(childControllerProvider.notifier);
    final sos = state.sos;
    if (sos == null || sos.phase == SosPhase.idle) return SosButton(onTriggered: controller.raiseSos);

    final text = switch (sos.phase) {
      SosPhase.sending => '…',
      SosPhase.sent => s.sosSent,
      SosPhase.acknowledged => s.sosAckByChild(sos.ackBy ?? ''),
      SosPhase.failed => s.sosSmsFallback,
      SosPhase.idle => '',
    };
    return Column(children: [
      Icon(sos.phase == SosPhase.acknowledged ? Icons.verified_user : Icons.sos, size: 96, color: AppColors.sos),
      const SizedBox(height: 12),
      Text(text, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
      if (sos.phase == SosPhase.failed)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: FilledButton.icon(
            onPressed: () {
              final f = sos.fix;
              final link = f == null ? '' : 'https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=17/${f.lat}/${f.lng}';
              // Opens the SMS app pre-filled; the child presses Send. Silent SMS is not allowed by store policies.
              launchUrl(Uri(scheme: 'sms', queryParameters: {'body': s.sosSmsText(link)}));
            },
            icon: const Icon(Icons.sms),
            label: Text(s.sendSms),
          ),
        ),
      TextButton(onPressed: controller.cancelSos, child: Text(s.sosCancel)),
    ]);
  }
}

class _PermissionCard extends StatelessWidget {
  const _PermissionCard({required this.access, required this.onGrant});
  final LocationAccess access;
  final Future<LocationAccess> Function() onGrant;

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final (text, action) = switch (access) {
      LocationAccess.serviceDisabled => (s.locationServiceOff, () => Geolocator.openLocationSettings()),
      LocationAccess.deniedForever => (s.permissionBody, () => Geolocator.openAppSettings()),
      LocationAccess.whileInUse => (s.permissionWhileInUse, () => Geolocator.openAppSettings()),
      _ => (s.permissionBody, () => onGrant()),
    };
    final label = access == LocationAccess.denied ? s.permissionGrant : s.permissionSettings;
    return Card(
      color: AppColors.sun.withValues(alpha: 0.2),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.permissionTitle, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text(text),
          const SizedBox(height: 10),
          FilledButton(onPressed: action, child: Text(label)),
        ]),
      ),
    );
  }
}
