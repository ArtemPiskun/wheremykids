import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'screens/child/child_home.dart';
import 'screens/parent/parent_home.dart';
import 'screens/welcome.dart';
import 'services/api.dart';
import 'services/push.dart';
import 'services/storage.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('uk');
  await Push.init();
  final storage = await Storage.open();
  runApp(MoiDityApp(storage: storage));
}

class MoiDityApp extends StatefulWidget {
  const MoiDityApp({super.key, required this.storage});
  final Storage storage;

  @override
  State<MoiDityApp> createState() => _MoiDityAppState();
}

class _MoiDityAppState extends State<MoiDityApp> {
  late Api api = Api(widget.storage.apiUrl, token: widget.storage.token);

  Future<void> _signedIn(Role role, String token, {String? childName}) async {
    await widget.storage.saveSession(role, token, childName: childName);
    setState(() => api = Api(widget.storage.apiUrl, token: token));
    Push.register(api).catchError((_) {});
  }

  Future<void> _signOut() async {
    await widget.storage.clear();
    setState(() => api = Api(widget.storage.apiUrl));
  }

  @override
  void initState() {
    super.initState();
    if (widget.storage.token != null) Push.register(api).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final role = widget.storage.token == null ? null : widget.storage.role;
    return MaterialApp(
      title: 'Мої діти',
      debugShowCheckedModeBanner: false,
      locale: const Locale('uk'),
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0057B7)),
        useMaterial3: true,
      ),
      home: switch (role) {
        Role.parent => ParentHome(api: api, onSignOut: _signOut),
        Role.child => ChildHome(api: api, storage: widget.storage, onSignOut: _signOut),
        null => WelcomeScreen(api: api, onSignedIn: _signedIn),
      },
    );
  }
}
