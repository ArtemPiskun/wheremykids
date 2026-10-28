-- Якість точок: під час тривог GPS глушать і підміняють (точка «стрибає» в Перу тощо)
ALTER TABLE locations
  ADD COLUMN quality text NOT NULL DEFAULT 'ok' CHECK (quality IN ('ok', 'low', 'rejected')),
  ADD COLUMN reason  text,
  ADD COLUMN source  text,
  ADD COLUMN mocked  boolean NOT NULL DEFAULT false;

-- Відколи телефон дитини шле недостовірні координати (NULL — усе гаразд)
ALTER TABLE children ADD COLUMN gps_unreliable_since timestamptz;
