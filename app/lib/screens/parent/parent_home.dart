import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/api.dart';
import '../chat_screen.dart';
import '../common.dart';
import 'child_map.dart';
import 'events_screen.dart';
import 'geofences_screen.dart';

class ParentHome extends StatefulWidget {
  const ParentHome({super.key, required this.api, required this.onSignOut});
  final Api api;
  final VoidCallback onSignOut;
  @override
  State<ParentHome> createState() => _ParentHomeState();
}

class _ParentHomeState extends State<ParentHome> {
  int _tab = 0;

  Future<void> _invite() async {
    try {
      final code = await widget.api.familyInvite();
      final members = await widget.api.familyMembers();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Запросити другого батька'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Нехай друга людина встановить «Мої діти», вибере «Я батько або мати», '
                'увімкне «У мене є код запрошення» і введе:'),
            const SizedBox(height: 16),
            Center(child: SelectableText(code, style: const TextStyle(fontSize: 36, letterSpacing: 8, fontWeight: FontWeight.bold))),
            const Center(child: Text('Код діє 24 години', style: TextStyle(color: Colors.grey))),
            const SizedBox(height: 16),
            Text('Зараз у сім\'ї: ${members.map((m) => m.isMe ? '${m.name} (ви)' : m.name).join(', ')}'),
          ]),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Готово'))],
        ),
      );
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _ChildrenTab(api: widget.api),
      EventsScreen(api: widget.api),
      GeofencesScreen(api: widget.api),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Мої діти'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) => v == 'invite' ? _invite() : widget.onSignOut(),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'invite', child: Text('Запросити другого батька')),
              PopupMenuItem(value: 'out', child: Text('Вийти')),
            ],
          ),
        ],
      ),
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.people), label: 'Діти'),
          NavigationDestination(icon: Icon(Icons.notifications), label: 'Події'),
          NavigationDestination(icon: Icon(Icons.place), label: 'Місця'),
        ],
      ),
    );
  }
}

class _ChildrenTab extends StatefulWidget {
  const _ChildrenTab({required this.api});
  final Api api;
  @override
  State<_ChildrenTab> createState() => _ChildrenTabState();
}

class _ChildrenTabState extends State<_ChildrenTab> {
  List<Child>? _children;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final c = await widget.api.children();
      if (mounted) setState(() => _children = c);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _addChild() async {
    final name = await _askName();
    if (name == null || name.isEmpty) return;
    try {
      final child = await widget.api.addChild(name);
      await _load();
      if (mounted) await _showCode(child);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<String?> _askName() {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Додати дитину'),
        content: TextField(controller: c, autofocus: true, decoration: const InputDecoration(labelText: "Ім'я"),
            textCapitalization: TextCapitalization.words),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Скасувати')),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('Додати')),
        ],
      ),
    );
  }

  Future<void> _showCode(Child child) async {
    final code = await widget.api.pairingCode(child.id);
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Код для ${child.name}'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Встановіть «Мої діти» на телефон дитини, виберіть «Це телефон дитини» і введіть код:'),
          const SizedBox(height: 16),
          SelectableText(code, style: const TextStyle(fontSize: 36, letterSpacing: 8, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('Код діє 15 хвилин', style: TextStyle(color: Colors.grey)),
        ]),
        actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Готово'))],
      ),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final children = _children;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addChild, icon: const Icon(Icons.add), label: const Text('Дитина')),
      body: children == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: children.isEmpty
                  ? ListView(children: const [
                      Padding(padding: EdgeInsets.all(32), child: Text('Додайте дитину, щоб бачити, де вона, і отримувати сповіщення про тривоги.', textAlign: TextAlign.center)),
                    ])
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                      children: [for (final c in children) _childCard(c)],
                    ),
            ),
    );
  }

  Widget _childCard(Child c) {
    return Card(
      child: InkWell(
        onTap: c.paired
            ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChildMapScreen(api: widget.api, child: c)))
            : () => _showCode(c),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              CircleAvatar(child: Text(c.name.characters.first)),
              const SizedBox(width: 12),
              Expanded(child: Text(c.name, style: Theme.of(context).textTheme.titleLarge)),
              if (c.paired)
                IconButton(
                  tooltip: 'Чат',
                  icon: const Icon(Icons.chat_bubble_outline),
                  onPressed: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => ChatScreen(api: widget.api, title: c.name, childId: c.id))),
                ),
              if (c.battery != null) ...[
                Icon(c.battery! <= 15 ? Icons.battery_alert : Icons.battery_std, size: 18),
                Text(' ${c.battery}%'),
              ],
            ]),
            const SizedBox(height: 8),
            if (!c.paired)
              const Text('Телефон дитини ще не під\'єднано. Натисніть, щоб отримати код.')
            else ...[
              Text('${c.oblast?.title ?? 'Область невідома'} · ${ago(c.seenAt)}'),
              const SizedBox(height: 8),
              Row(children: [
                Icon(Icons.circle, size: 12, color: alertColor(c.alertStatus)),
                const SizedBox(width: 6),
                Text(alertLabel(c.alertStatus), style: TextStyle(color: alertColor(c.alertStatus), fontWeight: FontWeight.w600)),
                if (c.alertStatus != 'N' && c.inShelterAt != null) ...[
                  const SizedBox(width: 8),
                  const Chip(label: Text('В укритті'), avatar: Icon(Icons.shield, size: 16), visualDensity: VisualDensity.compact),
                ],
              ]),
            ],
          ]),
        ),
      ),
    );
  }
}
