import 'dart:math';

/// Межі України з запасом (разом із Кримом). Під час тривог GPS глушать і
/// підміняють — телефон може «опинитися» в Перу чи посеред моря.
const _minLat = 44.1, _maxLat = 52.7, _minLon = 21.8, _maxLon = 40.6;

/// Швидше за 250 км/год дитина не пересувається
const maxSpeedMs = 70.0;

bool insideUkraine(double lat, double lon) => lat >= _minLat && lat <= _maxLat && lon >= _minLon && lon <= _maxLon;

double distanceM(double lat1, double lon1, double lat2, double lon2) {
  const r = 6371000.0;
  double rad(double d) => d * pi / 180;
  final dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  final a = pow(sin(dLat / 2), 2) + cos(rad(lat1)) * cos(rad(lat2)) * pow(sin(dLon / 2), 2);
  return 2 * r * asin(sqrt(a));
}

class Fix {
  const Fix(this.lat, this.lon, this.accuracy, this.at, {this.mocked = false});
  final double lat;
  final double lon;
  final double accuracy;
  final DateTime at;
  final bool mocked;
}

/// Чи схожа GPS-точка на підміну. Остаточно вирішує сервер; тут — лише щоб
/// вчасно попросити запасні координати з вишок і Wi-Fi.
bool looksSpoofed(Fix fix, Fix? lastGood) {
  if (fix.mocked || !insideUkraine(fix.lat, fix.lon)) return true;
  if (lastGood == null) return false;
  final d = distanceM(lastGood.lat, lastGood.lon, fix.lat, fix.lon) - lastGood.accuracy - fix.accuracy;
  if (d <= 1000) return false;
  final dt = fix.at.difference(lastGood.at).inMilliseconds / 1000;
  return dt <= 0 || d / dt > maxSpeedMs;
}
