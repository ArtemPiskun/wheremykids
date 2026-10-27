/// A single position sample from the OS, before or after filtering.
class Fix {
  const Fix({
    required this.lat,
    required this.lng,
    required this.accuracy,
    required this.timestamp,
    this.speed,
    this.heading,
    this.altitude,
    this.source = FixSource.fused,
    this.coarse = false,
  });

  final double lat;
  final double lng;

  /// Horizontal accuracy radius in metres (68% confidence).
  final double accuracy;
  final DateTime timestamp;

  /// Metres per second, when the OS reports it.
  final double? speed;
  final double? heading;
  final double? altitude;
  final FixSource source;

  /// Accepted despite poor accuracy because nothing better arrived for a long time.
  final bool coarse;

  Fix copyWith({double? lat, double? lng, double? accuracy, FixSource? source, bool? coarse}) => Fix(
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
        accuracy: accuracy ?? this.accuracy,
        timestamp: timestamp,
        speed: speed,
        heading: heading,
        altitude: altitude,
        source: source ?? this.source,
        coarse: coarse ?? this.coarse,
      );

  @override
  String toString() => 'Fix(${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)} ±${accuracy.round()}m @ $timestamp)';
}

enum FixSource { gps, network, fused, manual, sos }
