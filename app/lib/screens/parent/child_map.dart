import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../services/api.dart';
import 'package:intl/intl.dart';

import '../chat_screen.dart';
import '../common.dart';

/// Карта дитини: поточне місце, маршрут за сьогодні та геозони.
class ChildMapScreen extends StatefulWidget {
  const ChildMapScreen({super.key, required this.api, required this.child});
  final Api api;
  final Child child;
  @override
  State<ChildMapScreen> createState() => _ChildMapScreenState();
}

class _ChildMapScreenState extends State<ChildMapScreen> {
  List<TrackPoint> _track = [];
  List<Geofence> _zones = [];
  DateTime _day = DateUtils.dateOnly(DateTime.now());

  bool get _isToday => _day == DateUtils.dateOnly(DateTime.now());

  void _setDay(DateTime d) {
    setState(() => _day = DateUtils.dateOnly(d));
    _load();
  }

  Future<void> _pickDay() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _day,
      // Сервер зберігає історію 30 днів
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now,
    );
    if (d != null) _setDay(d);
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final track = await widget.api.track(widget.child.id, _day, _day.add(const Duration(days: 1)));
      final zones = await widget.api.geofences();
      if (mounted) setState(() { _track = track; _zones = zones; });
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _ring() async {
    try {
      await widget.api.ring(widget.child.id);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Сигнал надіслано')));
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.child;
    final here = c.lat == null ? null : LatLng(c.lat!, c.lon!);
    return Scaffold(
      appBar: AppBar(title: Text(c.name), actions: [
        IconButton(
          tooltip: 'Чат',
          icon: const Icon(Icons.chat_bubble_outline),
          onPressed: () => Navigator.push(context,
              MaterialPageRoute(builder: (_) => ChatScreen(api: widget.api, title: c.name, childId: c.id))),
        ),
      ]),
      body: Column(children: [
        Material(
          color: alertColor(c.alertStatus).withValues(alpha: 0.12),
          child: ListTile(
            leading: Icon(Icons.campaign, color: alertColor(c.alertStatus)),
            title: Text(alertLabel(c.alertStatus)),
            subtitle: Text('${c.oblast?.title ?? 'Область невідома'} · оновлено ${ago(c.seenAt)}'),
          ),
        ),
        if (c.gpsUnreliableSince != null)
          Padding(padding: const EdgeInsets.fromLTRB(8, 8, 8, 0), child: GpsWarning(since: c.gpsUnreliableSince!, lastGood: c.seenAt)),
        Row(children: [
          IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _setDay(_day.subtract(const Duration(days: 1)))),
          Expanded(
            child: TextButton.icon(
              onPressed: _pickDay,
              icon: const Icon(Icons.calendar_today, size: 18),
              label: Text(_isToday ? 'Маршрут за сьогодні' : 'Маршрут за ${DateFormat('d MMMM', 'uk').format(_day)}'),
            ),
          ),
          IconButton(icon: const Icon(Icons.chevron_right), onPressed: _isToday ? null : () => _setDay(_day.add(const Duration(days: 1)))),
        ]),
        Expanded(
          child: FlutterMap(
            options: MapOptions(
              initialCenter: here ?? const LatLng(50.45, 30.52),
              initialZoom: here == null ? 6 : 15,
            ),
            children: [
              osmTiles(),
              CircleLayer(circles: [
                for (final z in _zones)
                  CircleMarker(
                    point: LatLng(z.lat, z.lon),
                    radius: z.radiusM.toDouble(),
                    useRadiusInMeter: true,
                    color: Colors.blue.withValues(alpha: 0.15),
                    borderColor: Colors.blue,
                    borderStrokeWidth: 1.5,
                  ),
              ]),
              if (_track.length > 1)
                PolylineLayer(polylines: [
                  Polyline(points: [for (final p in _track) LatLng(p.lat, p.lon)], strokeWidth: 4, color: Colors.deepPurple),
                ]),
              if (here != null)
                MarkerLayer(markers: [
                  Marker(
                    point: here,
                    width: 48,
                    height: 48,
                    child: const Icon(Icons.location_on, size: 48, color: Color(0xFF0057B7)),
                  ),
                ]),
              const RichAttributionWidget(attributions: [TextSourceAttribution('© OpenStreetMap')]),
            ],
          ),
        ),
      ]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _ring,
        icon: const Icon(Icons.volume_up),
        label: const Text('Гучний сигнал'),
      ),
    );
  }
}
