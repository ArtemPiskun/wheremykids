import 'package:de_moi_dity/core/l10n/formatters.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('uk'));

  test('formats Ukrainian phone numbers', () {
    expect(formatUaPhone('+380671234567'), '+380 67 123 45 67');
    expect(normalizeUaPhone('067 123-45-67'), '+380671234567');
    expect(normalizeUaPhone('12345'), isNull);
  });

  test('uses dd.MM.yyyy and 24-hour time', () {
    const fmt = Fmt('uk');
    final d = DateTime(2026, 10, 25, 21, 19);
    expect(fmt.date(d), '25.10.2026');
    expect(fmt.time(d), '21:19');
  });
}
