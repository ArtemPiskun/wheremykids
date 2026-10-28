import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/api.dart';
import '../common.dart';

class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key, required this.api});
  final Api api;
  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  List<FamilyEvent>? _events;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final e = await widget.api.events();
      if (mounted) setState(() => _events = e);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  static (IconData, Color, String) _describe(FamilyEvent e) => switch (e.type) {
        'sos' => (Icons.sos, Colors.red, 'SOS'),
        'alert_start' => (Icons.campaign, Colors.red, 'Тривога в області дитини'),
        'moved_into_alert' => (Icons.campaign, Colors.red, 'Переміщення в зону тривоги'),
        'alert_end' => (Icons.check_circle, Colors.green, 'Відбій тривоги'),
        'shelter' => (Icons.shield, Colors.blue, 'В укритті'),
        'geofence_enter' => (Icons.login, Colors.teal, 'Прибуття'),
        'geofence_exit' => (Icons.logout, Colors.orange, 'Вихід із зони'),
        'low_battery' => (Icons.battery_alert, Colors.orange, 'Низький заряд'),
        'gps_unreliable' => (Icons.gps_off, Colors.brown, 'GPS ненадійний (глушіння)'),
        _ => (Icons.info, Colors.grey, e.type),
      };

  @override
  Widget build(BuildContext context) {
    final events = _events;
    if (events == null) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _load,
      child: events.isEmpty
          ? ListView(children: const [Padding(padding: EdgeInsets.all(32), child: Text('Подій поки немає', textAlign: TextAlign.center))])
          : ListView.separated(
              itemCount: events.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final e = events[i];
                final (icon, color, label) = _describe(e);
                return ListTile(
                  leading: Icon(icon, color: color),
                  title: Text('${e.childName ?? ''} · $label'),
                  subtitle: Text(DateFormat('d MMMM, HH:mm', 'uk').format(e.createdAt)),
                );
              },
            ),
    );
  }
}
