import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';

/// What the API stores about a device: enough to show "Samsung A54" in the device list, nothing more.
Future<Map<String, String>> describeDevice({String appVersion = '0.1.0'}) async {
  final info = DeviceInfoPlugin();
  if (Platform.isAndroid) {
    final a = await info.androidInfo;
    return {'platform': 'android', 'model': '${a.manufacturer} ${a.model}'.trim(), 'osVersion': 'Android ${a.version.release}', 'appVersion': appVersion};
  }
  final i = await info.iosInfo;
  return {'platform': 'ios', 'model': i.utsname.machine, 'osVersion': 'iOS ${i.systemVersion}', 'appVersion': appVersion};
}
