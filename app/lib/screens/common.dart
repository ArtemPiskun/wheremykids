import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';

/// Підкладка OpenStreetMap. Для продакшну краще власний тайл-сервер
/// або комерційний провайдер: публічні тайли OSM мають обмеження на навантаження.
TileLayer osmTiles() => TileLayer(
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      userAgentPackageName: 'ua.moidity.moi_dity',
    );

String ago(DateTime? t) {
  if (t == null) return 'ще немає даних';
  final d = DateTime.now().difference(t);
  if (d.inMinutes < 1) return 'щойно';
  if (d.inMinutes < 60) return '${d.inMinutes} хв тому';
  if (d.inHours < 24) return '${d.inHours} год тому';
  return DateFormat('d MMMM, HH:mm', 'uk').format(t);
}

Color alertColor(String status) => switch (status) {
      'A' => const Color(0xFFD32F2F),
      'P' => const Color(0xFFF57C00),
      _ => const Color(0xFF2E7D32),
    };

String alertLabel(String status) => switch (status) {
      'A' => 'Повітряна тривога',
      'P' => 'Часткова тривога в області',
      _ => 'Тривоги немає',
    };

void showError(BuildContext context, Object e) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
}

/// Попередження, коли GPS дитини глушать або підміняють
class GpsWarning extends StatelessWidget {
  const GpsWarning({super.key, required this.since, required this.lastGood});
  final DateTime since;
  final DateTime? lastGood;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: Colors.amber.shade100, borderRadius: BorderRadius.circular(8)),
      child: Row(children: [
        const Icon(Icons.gps_off, color: Colors.brown),
        const SizedBox(width: 8),
        Expanded(
          child: Text('GPS ненадійний з ${DateFormat('HH:mm', 'uk').format(since)} (ймовірно, глушіння). '
              'Показуємо останнє надійне місце: ${ago(lastGood)}.'),
        ),
      ]),
    );
  }
}
