-- Adds the Support / Help Desk module: tenants file tickets with Linkly's
-- own platform support team. These are new tables, unrelated to the
-- existing customers/conversations/messages inbox (that's the tenant's own
-- WhatsApp/social inbox, a different feature).
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'new',
  assigned_agent_id TEXT NOT NULL DEFAULT '',
  assigned_agent_name TEXT NOT NULL DEFAULT '',
  related_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_customer_reply_at TEXT NOT NULL DEFAULT '',
  last_agent_reply_at TEXT NOT NULL DEFAULT '',
  resolved_at TEXT NOT NULL DEFAULT '',
  closed_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_user_id TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  attachment_type TEXT NOT NULL DEFAULT '',
  attachment_url TEXT NOT NULL DEFAULT '',
  attachment_name TEXT NOT NULL DEFAULT '',
  attachment_mime TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_ticket_counter (
  id TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 10000
);

CREATE INDEX IF NOT EXISTS support_tickets_tenant_id_status_idx ON support_tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS support_tickets_status_priority_idx ON support_tickets(status, priority);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_agent_id_idx ON support_tickets(assigned_agent_id);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_id_created_at_idx ON support_ticket_messages(ticket_id, created_at);
