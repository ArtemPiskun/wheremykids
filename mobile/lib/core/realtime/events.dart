/// Server → client event names. Keep in sync with backend/src/modules/realtime/rooms.ts.
abstract final class RtEvents {
  static const locationUpdated = 'location.updated';
  static const childPresence = 'child.presence';
  static const geofenceTransition = 'geofence.transition';
  static const sosRaised = 'sos.raised';
  static const sosUpdated = 'sos.updated';
  static const sharingChanged = 'sharing.changed';
  static const childJoined = 'child.joined';
  static const childLeft = 'child.left';
  static const locationRequest = 'location.request';
  static const deviceRevoked = 'device.revoked';
  static const authExpired = 'auth.expired';

  static const presencePing = 'presence.ping';

  static const all = [
    locationUpdated,
    childPresence,
    geofenceTransition,
    sosRaised,
    sosUpdated,
    sharingChanged,
    childJoined,
    childLeft,
    locationRequest,
    deviceRevoked,
  ];
}

class RtEvent {
  const RtEvent(this.name, this.data);
  final String name;
  final Map<String, dynamic> data;
}
