import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/api.dart';
import '../../services/location_tracker.dart';
import '../../services/storage.dart';
import '../common.dart';

/// Екран на телефоні дитини: статус тривоги, SOS і «Я в укритті».
class ChildHome extends StatefulWidget {
  const ChildHome({super.key, required this.api, required this.storage, required this.onSignOut});
  final Api api;
  final Storage storage;
  final VoidCallback onSignOut;
  @override
  State<ChildHome> createState() => _ChildHomeState();
}

class _ChildHomeState extends State<ChildHome> {
  late final _tracker = LocationTracker(widget.api, widget.storage);
  Child? _me;
  String? _trackerError;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _tracker.start().then((err) {
      if (mounted) setState(() => _trackerError = err);
    });
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      _refresh();
      _tracker.flush();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    try {
      final me = await widget.api.me();
      if (mounted) setState(() => _me = me);
    } on ApiException catch (e) {
      // Батьки видалили дитину — пристрій більше не прив'язаний
      if (e.status == 401) widget.onSignOut();
    } catch (_) {}
  }

  Future<void> _sos() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Надіслати SOS?'),
        content: const Text('Батьки отримають тривожне сповіщення з твоїм місцем.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Ні')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.red), onPressed: () => Navigator.pop(ctx, true), child: const Text('Так, SOS')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await widget.api.sos(_tracker.last?.latitude, _tracker.last?.longitude);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Батьки отримали SOS')));
    } catch (e) {
      if (mounted) showError(context, 'Немає зв\'язку. Подзвони батькам або 112.');
    }
  }

  Future<void> _shelter() async {
    try {
      await widget.api.shelter();
      await _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    final status = me?.alertStatus ?? 'N';
    return Scaffold(
      appBar: AppBar(title: Text('Привіт, ${widget.storage.childName ?? ''}')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (_trackerError != null)
              Card(color: Colors.orange.shade50, child: ListTile(leading: const Icon(Icons.location_off), title: Text(_trackerError!))),
            Card(
              color: alertColor(status).withValues(alpha: 0.12),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(children: [
                  Icon(status == 'N' ? Icons.check_circle : Icons.campaign, size: 56, color: alertColor(status)),
                  const SizedBox(height: 8),
                  Text(alertLabel(status), style: Theme.of(context).textTheme.titleLarge?.copyWith(color: alertColor(status))),
                  Text(me?.oblast?.title ?? 'Визначаємо твою область…'),
                  if (status == 'A') ...[
                    const SizedBox(height: 12),
                    const Text('Прямуй до найближчого укриття.', textAlign: TextAlign.center),
                  ],
                ]),
              ),
            ),
            const SizedBox(height: 16),
            if (status != 'N')
              FilledButton.icon(
                onPressed: me?.inShelterAt != null ? null : _shelter,
                icon: const Icon(Icons.shield),
                label: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(me?.inShelterAt != null ? 'Батьки знають, що ти в укритті' : 'Я в укритті'),
                ),
              ),
            const SizedBox(height: 32),
            Center(
              child: SizedBox(
                width: 200,
                height: 200,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(shape: const CircleBorder(), backgroundColor: Colors.red, foregroundColor: Colors.white),
                  onPressed: _sos,
                  child: const Text('SOS', style: TextStyle(fontSize: 48, fontWeight: FontWeight.bold)),
                ),
              ),
            ),
            const SizedBox(height: 24),
            const Text('Твої батьки бачать, де ти, і отримують сповіщення про тривоги в твоїй області.',
                textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
