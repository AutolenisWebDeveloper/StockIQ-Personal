-- Phase 5 schema additions (flagged for operator sign-off).
-- §3 defined alerts/notifications/portfolios/portfolio_holdings/investment_journal/
-- thesis_tracker already; these are minimal display/UX columns only.

-- alerts: a human-readable name + creation time for the management UI.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- notifications: read tracking for the in-app unread badge.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (sent_at DESC) WHERE read_at IS NULL;
