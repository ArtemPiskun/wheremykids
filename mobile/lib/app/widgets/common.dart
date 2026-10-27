import 'package:flutter/material.dart';

import '../../core/network/api_error.dart';
import '../../features/family/data/models.dart';
import '../../l10n/app_localizations.dart';
import '../theme.dart';

/// Turns API and network failures into a sentence a parent or child can act on.
String errorText(BuildContext context, Object error) {
  final s = S.of(context);
  if (error is ApiError) {
    return switch (error.code) {
      ApiError.network || ApiError.timeout => s.errorNetwork,
      'INVALID_CREDENTIALS' => s.invalidCredentials,
      'EMAIL_TAKEN' => s.emailTaken,
      'INVITE_INVALID' => s.inviteInvalid,
      'PLAN_LIMIT_REACHED' => s.planLimit,
      'RATE_LIMITED' => s.tooManyAttempts,
      _ => s.errorGeneric,
    };
  }
  return s.errorGeneric;
}

void showError(BuildContext context, Object error) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(context, error))));

const _avatarColors = [Color(0xFF3B7BE0), Color(0xFFD9822B), Color(0xFF2E9E6B), Color(0xFF8E5BD8), Color(0xFFD14C7A)];

class ChildAvatar extends StatelessWidget {
  const ChildAvatar({super.key, required this.name, required this.id, this.status, this.size = 44});
  final String name;
  final String id;
  final ChildStatus? status;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = _avatarColors[id.hashCode.abs() % _avatarColors.length];
    final ring = status == null ? Colors.white : statusColor(status!);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color, border: Border.all(color: ring, width: 3), boxShadow: const [BoxShadow(blurRadius: 4, color: Colors.black26)]),
      alignment: Alignment.center,
      child: Text(name.characters.first.toUpperCase(), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.4)),
    );
  }
}

Color statusColor(ChildStatus s) => switch (s) {
      ChildStatus.online => AppColors.online,
      ChildStatus.recent => AppColors.recent,
      ChildStatus.offline => AppColors.offline,
      ChildStatus.paused => AppColors.sun,
    };

String statusLabel(S s, ChildStatus status) => switch (status) {
      ChildStatus.online => s.statusOnline,
      ChildStatus.recent => s.statusRecent,
      ChildStatus.offline => s.statusOffline,
      ChildStatus.paused => s.statusPaused,
    };

String agoLabel(S s, DateTime at, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(at);
  if (diff.inMinutes < 1) return s.justNow;
  if (diff.inMinutes < 60) return s.minutesAgo(diff.inMinutes);
  return s.hoursAgo(diff.inHours);
}

class BatteryLabel extends StatelessWidget {
  const BatteryLabel({super.key, required this.level, this.charging});
  final int level;
  final bool? charging;

  @override
  Widget build(BuildContext context) {
    final icon = charging == true
        ? Icons.battery_charging_full
        : level < 15
            ? Icons.battery_alert
            : level < 50
                ? Icons.battery_3_bar
                : Icons.battery_full;
    final color = level < 15 && charging != true ? AppColors.sos : Theme.of(context).colorScheme.onSurfaceVariant;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 16, color: color),
      Text('$level%', style: TextStyle(color: color, fontFeatures: const [FontFeature.tabularFigures()])),
    ]);
  }
}
