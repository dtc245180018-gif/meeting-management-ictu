-- Sprint 3 forward-only reference migration (PostgreSQL).
-- The application also applies equivalent additive changes at startup for
-- SQLite development databases.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

ALTER TYPE accountrole ADD VALUE IF NOT EXISTS 'ORGANIZER';
ALTER TYPE accountrole ADD VALUE IF NOT EXISTS 'PARTICIPANT';
UPDATE user_accounts SET role = 'ORGANIZER' WHERE role = 'EMPLOYEE';

CREATE TABLE IF NOT EXISTS room_access_policies (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    can_book BOOLEAN NOT NULL DEFAULT TRUE,
    reason VARCHAR(300),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_room_access_account_room UNIQUE (account_id, room_id)
);

CREATE INDEX IF NOT EXISTS ix_room_access_policies_account_id ON room_access_policies(account_id);
CREATE INDEX IF NOT EXISTS ix_room_access_policies_room_id ON room_access_policies(room_id);

CREATE TABLE IF NOT EXISTS account_audit_logs (
    id SERIAL PRIMARY KEY,
    actor_account_id INTEGER REFERENCES user_accounts(id) ON DELETE SET NULL,
    target_account_id INTEGER REFERENCES user_accounts(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_account_audit_logs_actor_account_id ON account_audit_logs(actor_account_id);
CREATE INDEX IF NOT EXISTS ix_account_audit_logs_target_account_id ON account_audit_logs(target_account_id);
