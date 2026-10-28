import 'package:flutter_test/flutter_test.dart';
import 'package:moi_dity/services/plausibility.dart';

void main() {
  final t0 = DateTime.utc(2026, 10, 28, 10);
  final kyiv = Fix(50.45, 30.52, 15, t0);

  test('Перу й підміна — підозрілі', () {
    expect(looksSpoofed(Fix(-12.05, -77.04, 10, t0.add(const Duration(minutes: 1))), kyiv), isTrue);
    expect(looksSpoofed(Fix(50.45, 30.52, 10, t0, mocked: true), null), isTrue);
  });

  test('стрибок Київ → Львів за 2 хв підозрілий, за 6 год — ні', () {
    expect(looksSpoofed(Fix(49.84, 24.03, 15, t0.add(const Duration(minutes: 2))), kyiv), isTrue);
    expect(looksSpoofed(Fix(49.84, 24.03, 15, t0.add(const Duration(hours: 6))), kyiv), isFalse);
  });

  test('звичайна прогулянка — нормально', () {
    expect(looksSpoofed(Fix(50.452, 30.525, 15, t0.add(const Duration(minutes: 5))), kyiv), isFalse);
    expect(looksSpoofed(kyiv, null), isFalse);
  });
}
