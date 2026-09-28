-- Sprint 1 schema migration. The application also applies these additions
-- defensively at startup for installations without a migration runner.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS expected_attendees INTEGER NOT NULL DEFAULT 1;
UPDATE meetings
SET expected_attendees = 1 + (
  SELECT COUNT(*) FROM participants WHERE participants.meeting_id = meetings.id
)
WHERE expected_attendees = 1;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS building VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor INTEGER NOT NULL DEFAULT 1;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_type VARCHAR(80) NOT NULL DEFAULT 'Phòng họp';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS projector BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS display BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS microphone BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS video_conferencing BOOLEAN NOT NULL DEFAULT FALSE;
