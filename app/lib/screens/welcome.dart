import 'package:flutter/material.dart';

import '../services/api.dart';
import '../services/storage.dart';

typedef SignedIn = Future<void> Function(Role role, String token, {String? childName});

/// Перший екран: вибір ролі пристрою.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key, required this.api, required this.onSignedIn});
  final Api api;
  final SignedIn onSignedIn;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text('Мої діти', style: Theme.of(context).textTheme.headlineLarge, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              const Text('Знайте, де ваші діти, і отримуйте сповіщення про тривоги в їхній області',
                  textAlign: TextAlign.center),
              const Spacer(),
              FilledButton.icon(
                icon: const Icon(Icons.family_restroom),
                label: const Padding(padding: EdgeInsets.all(12), child: Text('Я батько або мати')),
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => _ParentSignUp(api: api, onSignedIn: onSignedIn))),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.child_care),
                label: const Padding(padding: EdgeInsets.all(12), child: Text('Це телефон дитини')),
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => _ChildPairing(api: api, onSignedIn: onSignedIn))),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _ParentSignUp extends StatefulWidget {
  const _ParentSignUp({required this.api, required this.onSignedIn});
  final Api api;
  final SignedIn onSignedIn;
  @override
  State<_ParentSignUp> createState() => _ParentSignUpState();
}

class _ParentSignUpState extends State<_ParentSignUp> {
  final _name = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) return;
    setState(() { _busy = true; _error = null; });
    try {
      final token = await widget.api.registerParent(_name.text.trim());
      await widget.onSignedIn(Role.parent, token);
      if (mounted) Navigator.popUntil(context, (r) => r.isFirst);
    } catch (e) {
      setState(() { _busy = false; _error = 'Не вдалося зареєструватися: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Реєстрація')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          TextField(controller: _name, decoration: const InputDecoration(labelText: "Ваше ім'я"), textCapitalization: TextCapitalization.words),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.red))),
          const SizedBox(height: 24),
          FilledButton(onPressed: _busy ? null : _submit, child: const Text('Продовжити')),
        ]),
      ),
    );
  }
}

class _ChildPairing extends StatefulWidget {
  const _ChildPairing({required this.api, required this.onSignedIn});
  final Api api;
  final SignedIn onSignedIn;
  @override
  State<_ChildPairing> createState() => _ChildPairingState();
}

class _ChildPairingState extends State<_ChildPairing> {
  final _code = TextEditingController();
  bool _agreed = false;
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    setState(() { _busy = true; _error = null; });
    try {
      final r = await widget.api.pair(_code.text.trim());
      await widget.onSignedIn(Role.child, r.token, childName: r.childName);
      if (mounted) Navigator.popUntil(context, (r) => r.isFirst);
    } catch (e) {
      setState(() { _busy = false; _error = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Під'єднання до батьків")),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('Введи 6-значний код, який батьки бачать у своєму застосунку.'),
          const SizedBox(height: 16),
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            style: const TextStyle(fontSize: 28, letterSpacing: 8),
            textAlign: TextAlign.center,
            onChanged: (_) => setState(() {}),
          ),
          // Дитина має знати, що відбувається з її даними
          CheckboxListTile(
            value: _agreed,
            onChanged: (v) => setState(() => _agreed = v ?? false),
            title: const Text('Я розумію, що батьки бачитимуть, де я, і заряд телефону, '
                'а під час тривоги отримають сповіщення про мою область.'),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy || !_agreed || _code.text.length != 6 ? null : _submit,
            child: const Text("Під'єднатися"),
          ),
        ],
      ),
    );
  }
}
