import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app/app.dart';
import 'app/flavor.dart';
import 'app/providers.dart';
import 'features/auth/application/auth_controller.dart';

Future<void> bootstrap(AppFlavor flavor) async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([initializeDateFormatting('uk'), initializeDateFormatting('ru'), initializeDateFormatting('en')]);
  final container = ProviderContainer(overrides: [flavorProvider.overrideWithValue(flavor)]);
  await container.read(authControllerProvider).bootstrap();
  runApp(UncontrolledProviderScope(container: container, child: const DeMoiDityApp()));
}
