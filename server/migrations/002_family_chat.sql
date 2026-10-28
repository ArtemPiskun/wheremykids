-- Запрошення другого батька в сім'ю
CREATE TABLE family_invites (
  code        text PRIMARY KEY,
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES parents(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

-- Чат батьків з дитиною: окрема розмова на кожну дитину
CREATE TABLE messages (
  id                bigserial PRIMARY KEY,
  child_id          uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  sender_parent_id  uuid REFERENCES parents(id) ON DELETE SET NULL,
  from_child        boolean NOT NULL,
  text              text NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_child_idx ON messages(child_id, id);
