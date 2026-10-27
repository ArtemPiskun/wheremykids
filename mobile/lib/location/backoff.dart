import 'dart:math' as math;

/// Exponential backoff with jitter: 5 s, 10 s, 20 s ... capped at 5 min.
/// Jitter spreads reconnect storms when a whole city's mobile network comes back at once.
class Backoff {
  Backoff({
    this.base = const Duration(seconds: 5),
    this.max = const Duration(minutes: 5),
    math.Random? random,
  }) : _random = random ?? math.Random();

  final Duration base;
  final Duration max;
  final math.Random _random;
  int _attempt = 0;

  int get attempt => _attempt;

  Duration next() {
    final exp = base.inMilliseconds * math.pow(2, _attempt).toInt();
    final capped = math.min(exp, max.inMilliseconds);
    _attempt = math.min(_attempt + 1, 20);
    // "Equal jitter": half fixed, half random.
    return Duration(milliseconds: capped ~/ 2 + _random.nextInt(capped ~/ 2 + 1));
  }

  void reset() => _attempt = 0;
}
