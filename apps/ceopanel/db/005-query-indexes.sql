BEGIN;
-- Match the actual permission-scoped queue, inbox and rate-limit queries.
CREATE INDEX IF NOT EXISTS audit_actor_company_event_time ON audit_events(actor,company,event,created_at);
CREATE INDEX IF NOT EXISTS notifications_owner_time ON notifications(company,owner,created_at DESC);
CREATE INDEX IF NOT EXISTS channel_inbox_owner_time ON channel_inbox(company,owner,created_at DESC);
CREATE INDEX IF NOT EXISTS proposal_attachments_proposal ON proposal_attachments(proposal);
CREATE INDEX IF NOT EXISTS knowledge_documents_catalog ON knowledge_documents(company,collection,created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_pending ON knowledge_documents(status) WHERE status IN ('queued','awaiting_configuration');
CREATE INDEX IF NOT EXISTS mcp_clients_registration_time ON mcp_clients(created_at);
INSERT INTO platform_migrations(version) VALUES('005') ON CONFLICT DO NOTHING;
COMMIT;
