import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../config/env.dart';

export 'package:latlong2/latlong.dart' show LatLng;

/// Provider-neutral map primitives. Screens only use these types, so swapping
/// flutter_map for Google Maps or Mapbox means writing one new [AppMap] adapter.
class MapPin {
  const MapPin({required this.id, required this.point, required this.child, this.size = 56});
  final String id;
  final LatLng point;
  final Widget child;
  final double size;
}

class MapZone {
  const MapZone({required this.center, required this.radiusM, required this.color});
  final LatLng center;
  final double radiusM;
  final Color color;
}

class MapRoute {
  const MapRoute({required this.points, required this.color, this.width = 4});
  final List<LatLng> points;
  final Color color;
  final double width;
}

class AppMapController {
  final MapController _inner = MapController();

  void moveTo(LatLng point, {double zoom = 16}) => _inner.move(point, zoom);

  void fit(List<LatLng> points, {EdgeInsets padding = const EdgeInsets.all(64)}) {
    if (points.isEmpty) return;
    if (points.length == 1) return moveTo(points.first);
    _inner.fitCamera(CameraFit.coordinates(coordinates: points, padding: padding, maxZoom: 17));
  }
}

/// Kyiv city centre: a sensible first frame before any location is known.
const kyiv = LatLng(50.4501, 30.5234);

class AppMap extends StatelessWidget {
  const AppMap({
    super.key,
    required this.controller,
    this.pins = const [],
    this.zones = const [],
    this.routes = const [],
    this.initialCenter = kyiv,
    this.initialZoom = 12,
    this.onTap,
  });

  final AppMapController controller;
  final List<MapPin> pins;
  final List<MapZone> zones;
  final List<MapRoute> routes;
  final LatLng initialCenter;
  final double initialZoom;
  final ValueChanged<LatLng>? onTap;

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: controller._inner,
      options: MapOptions(
        initialCenter: initialCenter,
        initialZoom: initialZoom,
        maxZoom: 19,
        minZoom: 4,
        interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
        onTap: onTap == null ? null : (_, point) => onTap!(point),
      ),
      children: [
        TileLayer(
          urlTemplate: Env.tileUrl,
          userAgentPackageName: 'ua.demoidity.app',
          maxNativeZoom: 19,
        ),
        if (zones.isNotEmpty)
          CircleLayer(
            circles: [
              for (final z in zones)
                CircleMarker(
                  point: z.center,
                  radius: z.radiusM,
                  useRadiusInMeter: true,
                  color: z.color.withValues(alpha: 0.15),
                  borderColor: z.color,
                  borderStrokeWidth: 2,
                ),
            ],
          ),
        if (routes.isNotEmpty)
          PolylineLayer(polylines: [for (final r in routes) Polyline(points: r.points, color: r.color, strokeWidth: r.width)]),
        MarkerLayer(
          markers: [
            for (final p in pins) Marker(key: ValueKey(p.id), point: p.point, width: p.size, height: p.size + 22, child: p.child),
          ],
        ),
        const RichAttributionWidget(attributions: [TextSourceAttribution(Env.mapAttribution)]),
      ],
    );
  }
}
