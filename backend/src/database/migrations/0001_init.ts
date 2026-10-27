import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db);

  await sql`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      role text NOT NULL CHECK (role IN ('parent', 'child')),
      email citext UNIQUE,
      password_hash text,
      display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 64),
      avatar text,
      birth_year smallint CHECK (birth_year BETWEEN 1900 AND 2100),
      phone text,
      locale text NOT NULL DEFAULT 'uk' CHECK (locale IN ('uk', 'ru', 'en')),
      timezone text NOT NULL DEFAULT 'Europe/Kyiv',
      sharing_paused_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT parent_has_credentials CHECK (role = 'child' OR (email IS NOT NULL AND password_hash IS NOT NULL))
    )`.execute(db);

  await sql`
    CREATE TABLE families (
      id uuid PRIMARY KEY,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
      owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium', 'family')),
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);

  await sql`
    CREATE TABLE family_members (
      family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('owner', 'parent', 'child')),
      joined_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (family_id, user_id)
    )`.execute(db);
  await sql`CREATE INDEX family_members_user_idx ON family_members (user_id)`.execute(db);
  // A child belongs to exactly one family; parents may be in several.
  await sql`CREATE UNIQUE INDEX family_members_one_family_per_child ON family_members (user_id) WHERE role = 'child'`.execute(db);

  await sql`
    CREATE TABLE devices (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform text NOT NULL CHECK (platform IN ('android', 'ios')),
      model text,
      os_version text,
      app_version text,
      push_token text,
      battery_level smallint CHECK (battery_level BETWEEN 0 AND 100),
      is_charging boolean,
      last_seen_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX devices_user_active_idx ON devices (user_id) WHERE revoked_at IS NULL`.execute(db);
  await sql`CREATE UNIQUE INDEX devices_push_token_idx ON devices (push_token) WHERE push_token IS NOT NULL AND revoked_at IS NULL`.execute(db);

  await sql`
    CREATE TABLE refresh_tokens (
      id uuid PRIMARY KEY,
      device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash bytea NOT NULL UNIQUE,
      chain_id uuid NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      replaced_by uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX refresh_tokens_chain_idx ON refresh_tokens (chain_id)`.execute(db);
  await sql`CREATE INDEX refresh_tokens_device_idx ON refresh_tokens (device_id) WHERE revoked_at IS NULL`.execute(db);

  await sql`
    CREATE TABLE invites (
      id uuid PRIMARY KEY,
      kind text NOT NULL CHECK (kind IN ('child', 'parent')),
      family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      child_id uuid REFERENCES users(id) ON DELETE CASCADE,
      code_hash bytea NOT NULL UNIQUE,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      used_by_user uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((kind = 'child') = (child_id IS NOT NULL))
    )`.execute(db);

  // History is range-partitioned by month so retention is a cheap DROP of old partitions.
  await sql`
    CREATE TABLE locations (
      id bigint GENERATED ALWAYS AS IDENTITY,
      child_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id uuid NOT NULL,
      client_id uuid NOT NULL,
      recorded_at timestamptz NOT NULL,
      received_at timestamptz NOT NULL DEFAULT now(),
      payload bytea NOT NULL,
      key_version smallint NOT NULL,
      battery smallint,
      source text NOT NULL CHECK (source IN ('gps', 'network', 'fused', 'manual', 'sos')),
      motion text,
      PRIMARY KEY (id, recorded_at),
      UNIQUE (child_id, client_id, recorded_at)
    ) PARTITION BY RANGE (recorded_at)`.execute(db);
  await sql`CREATE INDEX locations_child_time_idx ON locations (child_id, recorded_at DESC)`.execute(db);
  await sql`CREATE TABLE locations_default PARTITION OF locations DEFAULT`.execute(db);

  await sql`
    CREATE TABLE geofences (
      id uuid PRIMARY KEY,
      family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 48),
      kind text NOT NULL CHECK (kind IN ('home', 'school', 'sport', 'other')),
      lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
      lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
      radius_m integer NOT NULL CHECK (radius_m BETWEEN 50 AND 2000),
      notify_enter boolean NOT NULL DEFAULT true,
      notify_exit boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX geofences_family_idx ON geofences (family_id)`.execute(db);

  await sql`
    CREATE TABLE geofence_states (
      geofence_id uuid NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
      child_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      inside boolean,
      outside_streak smallint NOT NULL DEFAULT 0,
      changed_at timestamptz NOT NULL,
      PRIMARY KEY (geofence_id, child_id)
    )`.execute(db);

  await sql`
    CREATE TABLE geofence_events (
      id uuid PRIMARY KEY,
      geofence_id uuid NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
      child_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('enter', 'exit')),
      occurred_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX geofence_events_family_time_idx ON geofence_events (family_id, occurred_at DESC)`.execute(db);

  await sql`
    CREATE TABLE sos_events (
      id uuid PRIMARY KEY,
      family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      child_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id uuid NOT NULL,
      client_id uuid NOT NULL,
      status text NOT NULL CHECK (status IN ('active', 'acknowledged', 'resolved', 'cancelled')),
      payload bytea,
      key_version smallint,
      battery smallint,
      created_at timestamptz NOT NULL DEFAULT now(),
      acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
      acknowledged_at timestamptz,
      closed_at timestamptz,
      UNIQUE (child_id, client_id)
    )`.execute(db);
  await sql`CREATE INDEX sos_events_family_open_idx ON sos_events (family_id, created_at DESC) WHERE status IN ('active', 'acknowledged')`.execute(db);

  await sql`
    CREATE TABLE consents (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('privacy_policy', 'location_tracking', 'parental')),
      version text NOT NULL,
      granted_by uuid NOT NULL,
      granted_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    )`.execute(db);
  await sql`CREATE INDEX consents_user_idx ON consents (user_id)`.execute(db);

  // No foreign keys: audit entries must outlive the rows they describe.
  await sql`
    CREATE TABLE audit_log (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_user_id uuid,
      actor_device_id uuid,
      action text NOT NULL,
      target_type text,
      target_id uuid,
      ip_hash bytea,
      meta jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id, created_at DESC)`.execute(db);
  await sql`CREATE INDEX audit_log_created_idx ON audit_log (created_at)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    'audit_log',
    'consents',
    'sos_events',
    'geofence_events',
    'geofence_states',
    'geofences',
    'locations',
    'invites',
    'refresh_tokens',
    'devices',
    'family_members',
    'families',
    'users',
  ]) {
    await sql`DROP TABLE IF EXISTS ${sql.table(table)} CASCADE`.execute(db);
  }
}
