import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:moi_dity/services/api.dart';

void main() {
  test('чат: батьки читають розмову дитини з after, дитина — свою', () async {
    final seen = <String>[];
    final client = MockClient((req) async {
      seen.add('${req.method} ${req.url.path}${req.url.hasQuery ? '?${req.url.query}' : ''}');
      if (req.method == 'POST') return http.Response('{"id":3,"createdAt":"2026-10-28T10:00:00Z"}', 201);
      return http.Response.bytes(
        utf8.encode(jsonEncode([
          {'id': 2, 'text': 'В школі', 'fromChild': true, 'senderName': 'Марійка', 'senderParentId': null, 'createdAt': '2026-10-28T10:00:00Z'},
        ])),
        200,
      );
    });
    final api = Api('http://x', token: 't', client: client);
    final msgs = await api.messages(childId: 'c1', after: 1);
    expect(msgs.single.fromChild, isTrue);
    expect(msgs.single.senderName, 'Марійка');
    await api.messages();
    await api.sendMessage('Ти де?', childId: 'c1');
    await api.sendMessage('Йду додому');
    expect(seen, [
      'GET /v1/children/c1/messages?after=1',
      'GET /v1/child/messages',
      'POST /v1/children/c1/messages',
      'POST /v1/child/messages',
    ]);
  });
}
