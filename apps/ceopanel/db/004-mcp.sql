BEGIN;
CREATE TABLE IF NOT EXISTS mcp_clients(
 id uuid PRIMARY KEY, name text NOT NULL, redirect_uris jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mcp_grants(
 id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES mcp_clients(id),
 owner text NOT NULL, company text NOT NULL, agent text NOT NULL, scopes text[] NOT NULL,
 refresh_hash text, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_grants_owner ON mcp_grants(owner,company,created_at);
CREATE TABLE IF NOT EXISTS mcp_codes(
 hash text PRIMARY KEY, grant_id uuid NOT NULL REFERENCES mcp_grants(id),
 expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE IF NOT EXISTS mcp_tool_calls(
 id uuid PRIMARY KEY, company text NOT NULL, owner text NOT NULL, agent text,
 principal text NOT NULL CHECK(principal IN ('human','agent')), grant_id uuid REFERENCES mcp_grants(id),
 plugin text NOT NULL, tool text NOT NULL, arguments_hash text NOT NULL,
 status text NOT NULL DEFAULT 'running', error_code integer,
 evidence jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS mcp_calls_owner ON mcp_tool_calls(company,owner,principal,created_at);
INSERT INTO platform_migrations(version) VALUES('004') ON CONFLICT DO NOTHING;
COMMIT;
