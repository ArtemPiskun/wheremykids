import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../app/widgets/common.dart';
import '../../../core/l10n/formatters.dart';
import '../../../l10n/app_localizations.dart';
import '../application/family_controller.dart';

class AddChildScreen extends ConsumerStatefulWidget {
  const AddChildScreen({super.key});

  @override
  ConsumerState<AddChildScreen> createState() => _AddChildScreenState();
}

class _AddChildScreenState extends ConsumerState<AddChildScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  int? _birthYear;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final familyId = ref.read(familyControllerProvider).valueOrNull?.family.id;
    if (familyId == null) return;
    setState(() => _busy = true);
    try {
      final phone = _phone.text.trim().isEmpty ? null : normalizeUaPhone(_phone.text);
      final childId = await ref.read(familyRepositoryProvider).addChild(familyId, name: _name.text.trim(), birthYear: _birthYear, phone: phone);
      await ref.read(familyControllerProvider.notifier).refresh();
      if (mounted) context.pushReplacement('/children/$childId/invite');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final year = DateTime.now().year;
    return Scaffold(
      appBar: AppBar(title: Text(s.addChild)),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(24), children: [
          TextFormField(
            controller: _name,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(labelText: s.childName),
            validator: (v) => (v == null || v.trim().isEmpty) ? s.childName : null,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int>(
            initialValue: _birthYear,
            decoration: InputDecoration(labelText: s.birthYear),
            items: [for (var y = year; y >= year - 18; y--) DropdownMenuItem(value: y, child: Text('$y'))],
            onChanged: (v) => setState(() => _birthYear = v),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(labelText: s.childPhone, hintText: s.phoneHint),
            validator: (v) => v == null || v.trim().isEmpty || normalizeUaPhone(v) != null ? null : s.invalidPhone,
          ),
          const SizedBox(height: 24),
          FilledButton(onPressed: _busy ? null : _save, child: Text(s.next)),
        ]),
      ),
    );
  }
}
