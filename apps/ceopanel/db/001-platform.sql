BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS platform_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS agent_runs(
 id uuid PRIMARY KEY, company text NOT NULL, owner text NOT NULL, agent text NOT NULL,
 prompt text NOT NULL, response text, evidence jsonb NOT NULL DEFAULT '[]', usage jsonb,
 status text NOT NULL DEFAULT 'running', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_owner ON agent_runs(company,owner,created_at);
CREATE TABLE IF NOT EXISTS proposals(
 id uuid PRIMARY KEY, company text NOT NULL, proposer text NOT NULL, agent text NOT NULL,
 department text NOT NULL, payload jsonb NOT NULL, evidence jsonb NOT NULL DEFAULT '[]',
 revision integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','rejected','executing','executed','needs_reconciliation')),
 approver text, result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposal_company ON proposals(company,status,created_at);
CREATE TABLE IF NOT EXISTS audit_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, company text NOT NULL,
 event text NOT NULL, target text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications(
 id uuid PRIMARY KEY, owner text NOT NULL, company text NOT NULL, title text NOT NULL,
 href text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_documents(
 id uuid PRIMARY KEY, company text NOT NULL, owner text NOT NULL, collection text NOT NULL,
 title text NOT NULL, filename text NOT NULL, mime text NOT NULL, checksum text NOT NULL,
 version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'queued',
 UNIQUE(company,collection,checksum), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_chunks(
 document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
 chunk integer NOT NULL, content text NOT NULL, embedding vector NOT NULL, model text NOT NULL,
 PRIMARY KEY(document_id,chunk)
);
CREATE TABLE IF NOT EXISTS event_inbox(
 id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE TABLE IF NOT EXISTS sync_state(source text PRIMARY KEY, last_event_at timestamptz, reconciled_at timestamptz);
INSERT INTO platform_migrations(version) VALUES('001') ON CONFLICT DO NOTHING;
COMMIT;
