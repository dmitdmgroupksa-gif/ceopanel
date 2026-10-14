BEGIN;
CREATE TABLE IF NOT EXISTS message_deliveries(
 proposal uuid PRIMARY KEY REFERENCES proposals(id), provider_id text UNIQUE NOT NULL,
 status text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_migrations(version) VALUES('002') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS channel_inbox(
 provider_id text PRIMARY KEY, channel text NOT NULL, owner text NOT NULL,
 company text NOT NULL, agent text NOT NULL, content text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
