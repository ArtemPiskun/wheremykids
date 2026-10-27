import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/widgets/common.dart';
import '../../../l10n/app_localizations.dart';
import '../application/family_controller.dart';

class CreateFamilyScreen extends ConsumerStatefulWidget {
  const CreateFamilyScreen({super.key});

  @override
  ConsumerState<CreateFamilyScreen> createState() => _CreateFamilyScreenState();
}

class _CreateFamilyScreenState extends ConsumerState<CreateFamilyScreen> {
  final _name = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (_name.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(familyControllerProvider.notifier).createFamily(_name.text.trim());
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.createFamilyTitle)),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          TextField(
            controller: _name,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(labelText: s.familyName, hintText: s.familyNameHint),
            onSubmitted: (_) => _create(),
          ),
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy ? null : _create, child: Text(s.create)),
        ]),
      ),
    );
  }
}
