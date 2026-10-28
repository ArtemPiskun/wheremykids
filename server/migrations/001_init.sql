-- Початкова схема «Мої діти»

CREATE TABLE families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE children (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name             text NOT NULL,
  -- Останні відомі дані, щоб не шукати їх у таблиці locations
  last_lat         double precision,
  last_lon         double precision,
  last_accuracy_m  real,
  last_seen_at     timestamptz,
  battery_pct      smallint,
  low_battery_sent boolean NOT NULL DEFAULT false,
  -- UID області за alerts.in.ua, у якій дитина зараз
  oblast_uid       smallint,
  in_shelter_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX children_family_idx ON children(family_id);
CREATE INDEX children_oblast_idx ON children(oblast_uid);

-- Пристрої: і батьків, і дітей. Токен зберігається лише як sha256.
CREATE TABLE devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES parents(id) ON DELETE CASCADE,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  fcm_token   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((parent_id IS NULL) <> (child_id IS NULL))
);
CREATE INDEX devices_parent_idx ON devices(parent_id);
CREATE INDEX devices_child_idx ON devices(child_id);

CREATE TABLE pairing_codes (
  code        text PRIMARY KEY,
  child_id    uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE locations (
  id           bigserial PRIMARY KEY,
  child_id     uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  lat          double precision NOT NULL,
  lon          double precision NOT NULL,
  accuracy_m   real,
  battery_pct  smallint,
  recorded_at  timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX locations_child_time_idx ON locations(child_id, recorded_at DESC);

CREATE TABLE geofences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       text NOT NULL,
  lat        double precision NOT NULL,
  lon        double precision NOT NULL,
  radius_m   integer NOT NULL CHECK (radius_m BETWEEN 50 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE geofence_state (
  child_id    uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  geofence_id uuid NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  inside      boolean NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, geofence_id)
);

-- Стрічка подій для батьків: SOS, геозони, тривоги, заряд, укриття
CREATE TABLE events (
  id          bigserial PRIMARY KEY,
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  type        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_family_time_idx ON events(family_id, created_at DESC);

-- Поточний стан тривоги по областях: N — немає, A — активна, P — часткова
CREATE TABLE oblast_alerts (
  oblast_uid  smallint PRIMARY KEY,
  status      char(1) NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
