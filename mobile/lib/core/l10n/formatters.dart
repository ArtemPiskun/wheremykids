import 'package:intl/intl.dart';

/// Ukrainian conventions: 25.10.2026, 21:19 (24h), +380 67 123 45 67.
class Fmt {
  const Fmt(this.locale);

  final String locale;

  String date(DateTime d) => DateFormat('dd.MM.yyyy', locale).format(d.toLocal());
  String time(DateTime d) => DateFormat('HH:mm', locale).format(d.toLocal());
  String dateTime(DateTime d) => DateFormat('dd.MM.yyyy, HH:mm', locale).format(d.toLocal());

  /// "21:19" for today, "вчора, 21:19" style handled by callers; otherwise "24.10, 21:19".
  String shortStamp(DateTime d, {DateTime? now}) {
    final local = d.toLocal();
    final today = (now ?? DateTime.now()).toLocal();
    final sameDay = local.year == today.year && local.month == today.month && local.day == today.day;
    return sameDay ? time(local) : DateFormat('dd.MM, HH:mm', locale).format(local);
  }

  static String phone(String e164) => formatUaPhone(e164);
}

/// Formats Ukrainian numbers as "+380 67 123 45 67"; other numbers are returned as is.
String formatUaPhone(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  final national = switch (digits.length) {
    12 when digits.startsWith('380') => digits.substring(3),
    10 when digits.startsWith('0') => digits.substring(1),
    9 => digits,
    _ => null,
  };
  if (national == null) return raw;
  return '+380 ${national.substring(0, 2)} ${national.substring(2, 5)} ${national.substring(5, 7)} ${national.substring(7)}';
}

/// Normalises user input to E.164 for the API: "067 123-45-67" → "+380671234567".
String? normalizeUaPhone(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.length == 10 && digits.startsWith('0')) return '+38$digits';
  if (digits.length == 12 && digits.startsWith('380')) return '+$digits';
  if (digits.length == 9) return '+380$digits';
  return null;
}
