-- Add is_completed column to existing events table (if you already ran the migration)
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;
