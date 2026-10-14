BEGIN;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS request_hash text;
CREATE TABLE IF NOT EXISTS proposal_attachments(
 id uuid PRIMARY KEY, proposal uuid NOT NULL REFERENCES proposals(id),
 filename text NOT NULL, mime text NOT NULL, checksum text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_migrations(version) VALUES('003') ON CONFLICT DO NOTHING;
COMMIT;
