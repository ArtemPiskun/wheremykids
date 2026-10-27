import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../app/theme.dart';
import '../../../l10n/app_localizations.dart';

/// Two guards against pocket presses: hold for 3 s, then a 5 s countdown that can be cancelled.
class SosButton extends StatefulWidget {
  const SosButton({super.key, required this.onTriggered, this.enabled = true});
  final Future<void> Function() onTriggered;
  final bool enabled;

  static const holdDuration = Duration(seconds: 3);
  static const countdownSeconds = 5;

  @override
  State<SosButton> createState() => _SosButtonState();
}

class _SosButtonState extends State<SosButton> with SingleTickerProviderStateMixin {
  late final AnimationController _hold = AnimationController(vsync: this, duration: SosButton.holdDuration)
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) _startCountdown();
    })
    ..addListener(() => setState(() {}));
  Timer? _timer;
  int? _remaining;

  void _startCountdown() {
    HapticFeedback.heavyImpact();
    setState(() => _remaining = SosButton.countdownSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      final left = (_remaining ?? 1) - 1;
      HapticFeedback.mediumImpact();
      if (left <= 0) {
        t.cancel();
        setState(() => _remaining = null);
        _hold.reset();
        unawaited(widget.onTriggered());
      } else {
        setState(() => _remaining = left);
      }
    });
  }

  void _cancel() {
    _timer?.cancel();
    _hold.reset();
    setState(() => _remaining = null);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _hold.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final counting = _remaining != null;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      GestureDetector(
        onLongPressStart: widget.enabled && !counting ? (_) => _hold.forward(from: 0) : null,
        onLongPressEnd: (_) {
          if (!_hold.isCompleted) _hold.reverse();
        },
        child: Semantics(
          button: true,
          label: 'SOS. ${s.sosHold}',
          child: SizedBox.square(
            dimension: 200,
            child: Stack(alignment: Alignment.center, children: [
              SizedBox.expand(child: CircularProgressIndicator(value: counting ? 1 : _hold.value, strokeWidth: 10, color: Colors.white, backgroundColor: AppColors.sos.withValues(alpha: 0.3))),
              Container(
                width: 170,
                height: 170,
                decoration: BoxDecoration(shape: BoxShape.circle, color: widget.enabled ? AppColors.sos : Colors.grey, boxShadow: const [BoxShadow(blurRadius: 16, color: Colors.black26)]),
                alignment: Alignment.center,
                child: Text(counting ? '$_remaining' : 'SOS', style: const TextStyle(color: Colors.white, fontSize: 48, fontWeight: FontWeight.w800)),
              ),
            ]),
          ),
        ),
      ),
      const SizedBox(height: 12),
      if (counting) ...[
        Text(s.sosCountdown(_remaining!), style: Theme.of(context).textTheme.titleMedium),
        TextButton(onPressed: _cancel, child: Text(s.cancel, style: const TextStyle(fontSize: 18))),
      ] else
        Text(s.sosHold, style: Theme.of(context).textTheme.bodyMedium),
    ]);
  }
}
