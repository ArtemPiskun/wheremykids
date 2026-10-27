export const rooms = {
  familyParents: (familyId: string) => `fam:${familyId}:parents`,
  child: (childId: string) => `child:${childId}`,
  device: (deviceId: string) => `dev:${deviceId}`,
  user: (userId: string) => `user:${userId}`,
};

/** Server → client event names. Keep in sync with mobile/lib/core/realtime/events.dart. */
export const ServerEvents = {
  LocationUpdated: 'location.updated',
  ChildPresence: 'child.presence',
  GeofenceTransition: 'geofence.transition',
  SosRaised: 'sos.raised',
  SosUpdated: 'sos.updated',
  SharingChanged: 'sharing.changed',
  ChildJoined: 'child.joined',
  ChildLeft: 'child.left',
  LocationRequest: 'location.request',
  DeviceRevoked: 'device.revoked',
  AuthExpired: 'auth.expired',
} as const;

export const ClientEvents = {
  PresencePing: 'presence.ping',
} as const;
