import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/env.dart';
import '../network/api_client.dart';
import 'events.dart';

enum RtConnection { disconnected, connecting, connected }

/// Socket.IO connection to `/rt`. Reconnects on its own; when the server says the
/// token expired it refreshes through [ApiClient] and reconnects with the new one.
class RealtimeClient {
  RealtimeClient(this.api, {String? baseUrl}) : _baseUrl = baseUrl ?? Env.apiUrl;

  final ApiClient api;
  final String _baseUrl;
  io.Socket? _socket;
  bool _wanted = false;

  final _events = StreamController<RtEvent>.broadcast();
  final _connection = StreamController<RtConnection>.broadcast();
  RtConnection _state = RtConnection.disconnected;

  Stream<RtEvent> get events => _events.stream;
  Stream<RtConnection> get connection => _connection.stream;
  RtConnection get state => _state;

  Stream<RtEvent> on(String name) => events.where((e) => e.name == name);

  void connect() {
    final token = api.session?.accessToken;
    if (token == null) return;
    _wanted = true;
    if (_socket != null) {
      _socket!.auth = {'token': token};
      if (_socket!.disconnected) _socket!.connect();
      return;
    }
    final socket = io.io(
      '$_baseUrl/rt',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(2000)
          .setReconnectionDelayMax(60000)
          .setRandomizationFactor(0.5)
          .build(),
    );
    socket.onConnect((_) => _setState(RtConnection.connected));
    socket.onDisconnect((_) => _setState(RtConnection.disconnected));
    socket.onReconnectAttempt((_) => _setState(RtConnection.connecting));
    socket.on(RtEvents.authExpired, (_) => unawaited(_reauthenticate()));
    for (final name in RtEvents.all) {
      socket.on(name, (data) {
        if (data is Map) _events.add(RtEvent(name, Map<String, dynamic>.from(data)));
      });
    }
    _socket = socket;
    _setState(RtConnection.connecting);
    socket.connect();
  }

  /// Fire-and-forget child presence ping with battery.
  void ping({required int battery, required bool charging}) {
    if (_state != RtConnection.connected) return;
    _socket?.emit(RtEvents.presencePing, {'battery': battery, 'charging': charging});
  }

  Future<void> _reauthenticate() async {
    final token = await api.freshAccessToken();
    if (token == null || !_wanted) return;
    _socket?.auth = {'token': token};
    // Give the server's disconnect a moment, then reconnect with the new token.
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (_socket?.disconnected ?? false) _socket?.connect();
  }

  void disconnect() {
    _wanted = false;
    _socket?.dispose();
    _socket = null;
    _setState(RtConnection.disconnected);
  }

  void _setState(RtConnection s) {
    _state = s;
    if (!_connection.isClosed) _connection.add(s);
    if (kDebugMode) debugPrint('Realtime: $s');
  }
}
