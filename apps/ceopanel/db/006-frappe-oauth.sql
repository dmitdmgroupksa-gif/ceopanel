BEGIN;
CREATE TABLE IF NOT EXISTS erp_oauth_flows (
  id_hash text PRIMARY KEY,
  encrypted_verifier text NOT NULL,
  return_path text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS erp_oauth_sessions (
  id_hash text PRIMARY KEY,
  owner text NOT NULL,
  encrypted_tokens text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_oauth_sessions_owner ON erp_oauth_sessions(owner, expires_at);
CREATE INDEX IF NOT EXISTS erp_oauth_flows_expiry ON erp_oauth_flows(expires_at);
INSERT INTO platform_migrations(version) VALUES('006') ON CONFLICT DO NOTHING;
COMMIT;
