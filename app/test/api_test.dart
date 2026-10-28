import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:moi_dity/services/api.dart';

void main() {
  test('список дітей: розбір статусу тривоги, області й укриття', () async {
    final client = MockClient((req) async {
      expect(req.headers['Authorization'], 'Bearer t1');
      expect(req.url.path, '/v1/children');
      return http.Response.bytes(
        utf8.encode(jsonEncode([
          {
            'id': 'c1',
            'name': 'Марійка',
            'lastLocation': {'lat': 50.45, 'lon': 30.52, 'accuracy': 10, 'at': '2026-10-28T10:00:00Z'},
            'battery': 42,
            'oblast': {'uid': 31, 'title': 'м. Київ'},
            'alertStatus': 'A',
            'inShelterAt': '2026-10-28T10:05:00Z',
            'paired': true,
          },
          {'id': 'c2', 'name': 'Тарас', 'lastLocation': null, 'battery': null, 'oblast': null, 'alertStatus': 'N', 'inShelterAt': null, 'paired': false},
        ])),
        200,
      );
    });
    final kids = await Api('http://x', token: 't1', client: client).children();
    expect(kids[0].oblast!.title, 'м. Київ');
    expect(kids[0].alertStatus, 'A');
    expect(kids[0].inShelterAt, isNotNull);
    expect(kids[1].lat, isNull);
    expect(kids[1].paired, isFalse);
  });

  test('помилка сервера показується українською', () async {
    final client = MockClient((_) async => http.Response.bytes(utf8.encode(jsonEncode({'error': 'Код недійсний або прострочений'})), 404));
    await expectLater(
      Api('http://x', client: client).pair('123456'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Код недійсний або прострочений')),
    );
  });
}
