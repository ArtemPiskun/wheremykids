import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/auth_screen.dart';
import '../features/child_home/presentation/child_home_screen.dart';
import '../features/child_home/presentation/child_onboarding_screen.dart';
import '../features/family/application/family_controller.dart';
import '../features/family/presentation/add_child_screen.dart';
import '../features/family/presentation/create_family_screen.dart';
import '../features/family/presentation/invite_screen.dart';
import '../features/geofences/presentation/geofences_screen.dart';
import '../features/history/presentation/history_screen.dart';
import '../features/map/presentation/parent_home_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/sos/presentation/sos_alert_screen.dart';
import 'flavor.dart';
import 'providers.dart';

/// Bridges Riverpod state changes to GoRouter's redirect.
class _RouterRefresh extends ChangeNotifier {
  void ping() => notifyListeners();
}

final routerProvider = Provider<GoRouter>((ref) {
  final flavor = ref.watch(flavorProvider);
  final refresh = _RouterRefresh();
  ref.listen(sessionProvider, (_, __) => refresh.ping());
  if (flavor == AppFlavor.parent) ref.listen(familyControllerProvider, (_, __) => refresh.ping());
  ref.onDispose(refresh.dispose);

  return flavor == AppFlavor.parent ? _parentRouter(ref, refresh) : _childRouter(ref, refresh);
});

GoRouter _parentRouter(Ref ref, Listenable refresh) => GoRouter(
      refreshListenable: refresh,
      initialLocation: '/',
      redirect: (context, state) {
        final signedIn = ref.read(sessionProvider) != null;
        final at = state.matchedLocation;
        if (!signedIn) return at == '/auth' ? null : '/auth';
        final family = ref.read(familyControllerProvider);
        if (family.isLoading) return null;
        final hasFamily = family.valueOrNull != null;
        if (!hasFamily && !family.hasError) return at == '/family/new' ? null : '/family/new';
        if (at == '/auth' || (at == '/family/new' && hasFamily)) return '/';
        return null;
      },
      routes: [
        GoRoute(path: '/auth', builder: (_, __) => const AuthScreen()),
        GoRoute(path: '/family/new', builder: (_, __) => const CreateFamilyScreen()),
        GoRoute(path: '/', builder: (_, __) => const ParentHomeScreen()),
        GoRoute(path: '/children/new', builder: (_, __) => const AddChildScreen()),
        GoRoute(path: '/children/:id/invite', builder: (_, s) => InviteScreen(childId: s.pathParameters['id']!)),
        GoRoute(path: '/children/:id/history', builder: (_, s) => HistoryScreen(childId: s.pathParameters['id']!)),
        GoRoute(path: '/zones', builder: (_, __) => const GeofencesScreen()),
        GoRoute(path: '/sos/:id', builder: (_, s) => SosAlertScreen(sosId: s.pathParameters['id']!)),
        GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      ],
    );

GoRouter _childRouter(Ref ref, Listenable refresh) => GoRouter(
      refreshListenable: refresh,
      initialLocation: '/',
      redirect: (context, state) {
        final signedIn = ref.read(sessionProvider) != null;
        final at = state.matchedLocation;
        if (!signedIn) return at == '/onboarding' ? null : '/onboarding';
        if (at == '/onboarding') return '/';
        return null;
      },
      routes: [
        GoRoute(path: '/onboarding', builder: (_, __) => const ChildOnboardingScreen()),
        GoRoute(path: '/', builder: (_, __) => const ChildHomeScreen()),
      ],
    );
