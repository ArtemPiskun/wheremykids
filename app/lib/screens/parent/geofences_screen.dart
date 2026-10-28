import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../services/api.dart';
import '../common.dart';

/// Важливі місця (геозони): дім, школа, секція.
class GeofencesScreen extends StatefulWidget {
  const GeofencesScreen({super.key, required this.api});
  final Api api;
  @override
  State<GeofencesScreen> createState() => _GeofencesScreenState();
}

class _GeofencesScreenState extends State<GeofencesScreen> {
  List<Geofence>? _zones;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final z = await widget.api.geofences();
      if (mounted) setState(() => _zones = z);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _delete(Geofence z) async {
    try {
      await widget.api.deleteGeofence(z.id);
      _load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final zones = _zones;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add_location_alt),
        label: const Text('Місце'),
        onPressed: () async {
          final added = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => _AddGeofence(api: widget.api)));
          if (added == true) _load();
        },
      ),
      body: zones == null
          ? const Center(child: CircularProgressIndicator())
          : zones.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(32),
                  child: Text('Додайте дім, школу чи секцію — ми повідомимо, коли дитина прийде або піде.', textAlign: TextAlign.center))
              : ListView(children: [
                  for (final z in zones)
                    ListTile(
                      leading: const Icon(Icons.place),
                      title: Text(z.name),
                      subtitle: Text('Радіус ${z.radiusM} м'),
                      trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _delete(z)),
                    ),
                ]),
    );
  }
}

class _AddGeofence extends StatefulWidget {
  const _AddGeofence({required this.api});
  final Api api;
  @override
  State<_AddGeofence> createState() => _AddGeofenceState();
}

class _AddGeofenceState extends State<_AddGeofence> {
  final _name = TextEditingController();
  LatLng? _point;
  double _radius = 150;

  Future<void> _save() async {
    if (_point == null || _name.text.trim().isEmpty) return;
    try {
      await widget.api.addGeofence(_name.text.trim(), _point!.latitude, _point!.longitude, _radius.round());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Нове місце'), actions: [TextButton(onPressed: _save, child: const Text('Зберегти'))]),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(controller: _name, decoration: const InputDecoration(labelText: 'Назва, напр. «Школа»')),
        ),
        Row(children: [
          const SizedBox(width: 16),
          Text('Радіус ${_radius.round()} м'),
          Expanded(child: Slider(value: _radius, min: 50, max: 1000, divisions: 19, onChanged: (v) => setState(() => _radius = v))),
        ]),
        const Text('Торкніться карти, щоб вибрати місце'),
        Expanded(
          child: FlutterMap(
            options: MapOptions(
              initialCenter: const LatLng(50.45, 30.52),
              initialZoom: 12,
              onTap: (_, p) => setState(() => _point = p),
            ),
            children: [
              osmTiles(),
              if (_point != null)
                CircleLayer(circles: [
                  CircleMarker(point: _point!, radius: _radius, useRadiusInMeter: true,
                      color: Colors.blue.withValues(alpha: 0.2), borderColor: Colors.blue, borderStrokeWidth: 2),
                ]),
            ],
          ),
        ),
      ]),
    );
  }
}
