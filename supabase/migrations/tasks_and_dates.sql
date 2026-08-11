-- Create tasks table
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  content text not null,
  is_completed boolean default false,
  due_date timestamp with time zone,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  assignee_id uuid, -- Optional, links to auth.users but no hard constraint to avoid schema issues
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS is disabled to match existing architecture (custom auth)
-- alter table tasks enable row level security;

-- Add due_date to notes
alter table notes add column if not exists due_date timestamp with time zone;
