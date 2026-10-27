import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../app/widgets/common.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/application/auth_controller.dart';

/// Consent comes first: the child reads what parents will see before any code is entered.
class ChildOnboardingScreen extends ConsumerStatefulWidget {
  const ChildOnboardingScreen({super.key});

  @override
  ConsumerState<ChildOnboardingScreen> createState() => _ChildOnboardingScreenState();
}

class _ChildOnboardingScreenState extends ConsumerState<ChildOnboardingScreen> {
  bool _consented = false;
  bool _busy = false;
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _connect(String code) async {
    setState(() => _busy = true);
    try {
      await ref.read(authControllerProvider).redeemInvite(code);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _scan() async {
    final code = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const _QrScanPage()));
    if (code != null) await _connect(code);
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          Icon(Icons.favorite_outline, size: 48, color: theme.colorScheme.primary),
          const SizedBox(height: 16),
          Text(s.childWelcomeTitle, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.consentTitle, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Text(s.consentBody),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          if (!_consented)
            FilledButton(onPressed: () => setState(() => _consented = true), child: Text(s.consentAccept))
          else ...[
            OutlinedButton.icon(onPressed: _busy ? null : _scan, icon: const Icon(Icons.qr_code_scanner), label: Text(s.scanQr)),
            const SizedBox(height: 16),
            TextField(
              controller: _code,
              textCapitalization: TextCapitalization.characters,
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall?.copyWith(letterSpacing: 4),
              decoration: InputDecoration(labelText: s.enterCode, hintText: 'K7M2-QX9D'),
              onSubmitted: _busy ? null : _connect,
            ),
            const SizedBox(height: 12),
            FilledButton(onPressed: _busy ? null : () => _connect(_code.text), child: Text(s.connect)),
          ],
        ]),
      ),
    );
  }
}

class _QrScanPage extends StatefulWidget {
  const _QrScanPage();

  @override
  State<_QrScanPage> createState() => _QrScanPageState();
}

class _QrScanPageState extends State<_QrScanPage> {
  bool _done = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(S.of(context).scanQr)),
      body: MobileScanner(
        onDetect: (capture) {
          if (_done) return;
          for (final b in capture.barcodes) {
            final uri = Uri.tryParse(b.rawValue ?? '');
            final code = uri?.scheme == 'demoidity' && uri?.host == 'invite' ? uri!.queryParameters['c'] : null;
            if (code != null) {
              _done = true;
              Navigator.of(context).pop(code);
              return;
            }
          }
        },
      ),
    );
  }
}
