CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS logs (
  id        BIGSERIAL PRIMARY KEY,
  service   TEXT        NOT NULL,
  level     TEXT        NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message   TEXT        NOT NULL,
  metadata  JSONB       NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Filtered, newest-first pagination
CREATE INDEX IF NOT EXISTS logs_service_id_idx ON logs (service, id DESC);
CREATE INDEX IF NOT EXISTS logs_level_id_idx   ON logs (level, id DESC);
-- Time-window stats
CREATE INDEX IF NOT EXISTS logs_timestamp_idx  ON logs (timestamp DESC);
-- Fast ILIKE '%text%' search instead of a full table scan
CREATE INDEX IF NOT EXISTS logs_message_trgm_idx ON logs USING gin (message gin_trgm_ops);
