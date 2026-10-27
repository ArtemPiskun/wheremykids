import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
type Json = ColumnType<unknown, string, string>;

export type UserRole = 'parent' | 'child';
export type MemberRole = 'owner' | 'parent' | 'child';
export type Locale = 'uk' | 'ru' | 'en';
export type Plan = 'free' | 'premium' | 'family';
export type Platform = 'android' | 'ios';
export type LocationSource = 'gps' | 'network' | 'fused' | 'manual' | 'sos';
export type GeofenceKind = 'home' | 'school' | 'sport' | 'other';
export type SosStatus = 'active' | 'acknowledged' | 'resolved' | 'cancelled';
export type InviteKind = 'child' | 'parent';
export type ConsentKind = 'privacy_policy' | 'location_tracking' | 'parental';

export interface UsersTable {
  id: string;
  role: UserRole;
  email: string | null;
  password_hash: string | null;
  display_name: string;
  avatar: string | null;
  birth_year: number | null;
  phone: string | null;
  locale: Generated<Locale>;
  timezone: Generated<string>;
  sharing_paused_until: Timestamp | null;
  created_at: CreatedAt;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface FamiliesTable {
  id: string;
  name: string;
  owner_id: string;
  plan: Generated<Plan>;
  created_at: CreatedAt;
}

export interface FamilyMembersTable {
  family_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: CreatedAt;
}

export interface DevicesTable {
  id: string;
  user_id: string;
  platform: Platform;
  model: string | null;
  os_version: string | null;
  app_version: string | null;
  push_token: string | null;
  battery_level: number | null;
  is_charging: boolean | null;
  last_seen_at: Timestamp | null;
  revoked_at: Timestamp | null;
  created_at: CreatedAt;
}

export interface RefreshTokensTable {
  id: string;
  device_id: string;
  user_id: string;
  token_hash: Buffer;
  chain_id: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  replaced_by: string | null;
  created_at: CreatedAt;
}

export interface InvitesTable {
  id: string;
  kind: InviteKind;
  family_id: string;
  child_id: string | null;
  code_hash: Buffer;
  created_by: string;
  expires_at: Timestamp;
  used_at: Timestamp | null;
  used_by_user: string | null;
  created_at: CreatedAt;
}

export interface LocationsTable {
  id: Generated<string>;
  child_id: string;
  device_id: string;
  client_id: string;
  recorded_at: Timestamp;
  received_at: CreatedAt;
  payload: Buffer;
  key_version: number;
  battery: number | null;
  source: LocationSource;
  motion: string | null;
}

export interface GeofencesTable {
  id: string;
  family_id: string;
  name: string;
  kind: GeofenceKind;
  lat: number;
  lng: number;
  radius_m: number;
  notify_enter: boolean;
  notify_exit: boolean;
  created_by: string;
  created_at: CreatedAt;
}

export interface GeofenceStatesTable {
  geofence_id: string;
  child_id: string;
  inside: boolean | null;
  outside_streak: number;
  changed_at: Timestamp;
}

export interface GeofenceEventsTable {
  id: string;
  geofence_id: string;
  child_id: string;
  family_id: string;
  kind: 'enter' | 'exit';
  occurred_at: Timestamp;
  created_at: CreatedAt;
}

export interface SosEventsTable {
  id: string;
  family_id: string;
  child_id: string;
  device_id: string;
  client_id: string;
  status: SosStatus;
  payload: Buffer | null;
  key_version: number | null;
  battery: number | null;
  created_at: CreatedAt;
  acknowledged_by: string | null;
  acknowledged_at: Timestamp | null;
  closed_at: Timestamp | null;
}

export interface ConsentsTable {
  id: string;
  user_id: string;
  kind: ConsentKind;
  version: string;
  granted_by: string;
  granted_at: CreatedAt;
  revoked_at: Timestamp | null;
}

export interface AuditLogTable {
  id: Generated<string>;
  actor_user_id: string | null;
  actor_device_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_hash: Buffer | null;
  meta: Json | null;
  created_at: CreatedAt;
}

export interface Database {
  users: UsersTable;
  families: FamiliesTable;
  family_members: FamilyMembersTable;
  devices: DevicesTable;
  refresh_tokens: RefreshTokensTable;
  invites: InvitesTable;
  locations: LocationsTable;
  geofences: GeofencesTable;
  geofence_states: GeofenceStatesTable;
  geofence_events: GeofenceEventsTable;
  sos_events: SosEventsTable;
  consents: ConsentsTable;
  audit_log: AuditLogTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type Family = Selectable<FamiliesTable>;
export type Device = Selectable<DevicesTable>;
export type Geofence = Selectable<GeofencesTable>;
export type SosEvent = Selectable<SosEventsTable>;
