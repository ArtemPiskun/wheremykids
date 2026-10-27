import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../app/providers.dart';
import '../../../app/widgets/common.dart';
import '../../../core/l10n/formatters.dart';
import '../../../core/realtime/events.dart';
import '../../../l10n/app_localizations.dart';
import '../application/family_controller.dart';
import '../data/models.dart';

/// Shows a QR code and the same code as text, for dictating over the phone.
class InviteScreen extends ConsumerStatefulWidget {
  const InviteScreen({super.key, required this.childId});
  final String childId;

  @override
  ConsumerState<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends ConsumerState<InviteScreen> {
  Invite? _invite;
  Object? _error;
  StreamSubscription<RtEvent>? _joined;

  @override
  void initState() {
    super.initState();
    unawaited(_create());
    _joined = ref.read(realtimeProvider).on(RtEvents.childJoined).listen((e) {
      if (e.data['childId'] == widget.childId && mounted) Navigator.of(context).pop();
    });
  }

  @override
  void dispose() {
    _joined?.cancel();
    super.dispose();
  }

  Future<void> _create() async {
    final familyId = ref.read(familyControllerProvider).valueOrNull?.family.id;
    if (familyId == null) return;
    setState(() => _error = null);
    try {
      final invite = await ref.read(familyRepositoryProvider).createChildInvite(familyId, widget.childId);
      if (mounted) setState(() => _invite = invite);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final invite = _invite;
    final fmt = Fmt(Localizations.localeOf(context).toLanguageTag());
    return Scaffold(
      appBar: AppBar(title: Text(s.inviteTitle)),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        Text(s.inviteSteps, style: Theme.of(context).textTheme.bodyLarge),
        const SizedBox(height: 24),
        if (_error != null) ...[
          Text(errorText(context, _error!), style: TextStyle(color: Theme.of(context).colorScheme.error)),
          TextButton(onPressed: _create, child: Text(s.retry)),
        ] else if (invite == null)
          const Center(child: CircularProgressIndicator())
        else ...[
          Center(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
              child: QrImageView(data: invite.qrPayload, size: 220, backgroundColor: Colors.white),
            ),
          ),
          const SizedBox(height: 20),
          Center(
            child: SelectableText(
              invite.code,
              style: Theme.of(context).textTheme.displaySmall?.copyWith(letterSpacing: 4, fontFeatures: const [FontFeature.tabularFigures()]),
            ),
          ),
          Center(
            child: TextButton.icon(
              onPressed: () => Clipboard.setData(ClipboardData(text: invite.code)),
              icon: const Icon(Icons.copy),
              label: Text(invite.code),
            ),
          ),
          Center(child: Text(s.inviteExpires(fmt.dateTime(invite.expiresAt)))),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: _create, child: Text(s.newCode)),
        ],
      ]),
    );
  }
}
