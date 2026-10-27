import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/widgets/common.dart';
import '../../l10n/app_localizations.dart';
import '../auth/application/auth_controller.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.settings)),
      body: ListView(children: [
        ListTile(
          leading: const Icon(Icons.download_outlined),
          title: Text(s.exportData),
          onTap: () async {
            try {
              final data = await ref.read(familyRepositoryProvider).exportData();
              // MVP: copy JSON; a share-sheet file export comes with the settings redesign.
              await Clipboard.setData(ClipboardData(text: const JsonEncoder.withIndent('  ').convert(data)));
              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${s.exportData}: OK')));
            } catch (e) {
              if (context.mounted) showError(context, e);
            }
          },
        ),
        ListTile(leading: const Icon(Icons.logout), title: Text(s.logout), onTap: () => ref.read(authControllerProvider).signOut()),
        const Divider(),
        ListTile(
          leading: Icon(Icons.delete_forever_outlined, color: Theme.of(context).colorScheme.error),
          title: Text(s.deleteAccount, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          onTap: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                content: Text(s.deleteAccountConfirm),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.cancel)),
                  FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.delete)),
                ],
              ),
            );
            if (ok != true) return;
            try {
              await ref.read(familyRepositoryProvider).deleteAccount();
              await ref.read(authControllerProvider).forget();
            } catch (e) {
              if (context.mounted) showError(context, e);
            }
          },
        ),
      ]),
    );
  }
}
