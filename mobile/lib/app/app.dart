import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import 'flavor.dart';
import 'providers.dart';
import 'router.dart';
import 'theme.dart';

class DeMoiDityApp extends ConsumerWidget {
  const DeMoiDityApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flavor = ref.watch(flavorProvider);
    return MaterialApp.router(
      onGenerateTitle: (ctx) => flavor == AppFlavor.parent ? S.of(ctx).appTitle : S.of(ctx).childAppTitle,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      routerConfig: ref.watch(routerProvider),
      // Ukrainian first; Russian and English are offered, never the default.
      supportedLocales: S.supportedLocales,
      localizationsDelegates: const [
        S.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      localeListResolutionCallback: (locales, supported) {
        for (final l in locales ?? const <Locale>[]) {
          final match = supported.where((s) => s.languageCode == l.languageCode).firstOrNull;
          if (match != null) return match;
        }
        return const Locale('uk');
      },
      debugShowCheckedModeBanner: false,
    );
  }
}
