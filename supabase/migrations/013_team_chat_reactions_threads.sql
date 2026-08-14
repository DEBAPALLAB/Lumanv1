-- ===========================================================================
-- TEAM CHAT — reactions and thread counts. Phase 2.
-- ===========================================================================
--
-- Builds on 012_team_chat.sql. Additive only: no existing table, policy or
-- function is altered or dropped, for the same reason 012 was additive — this
-- database is shared with the Luman and Luman-Desktop apps.
--
-- Threading needs no new table: messages.parent_message_id already exists from
-- 012. What is added here is the reaction store, a toggle function, and a view
-- that carries reaction counts and reply counts alongside each message so the
-- history route stays a single query instead of N+1.
--
-- ROLLBACK is at the bottom of this file.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- message_reactions
-- ---------------------------------------------------------------------------
-- One row per (message, user, emoji). Counts are aggregated on read rather
-- than denormalised into a counter column: a counter would need a trigger to
-- stay true, and at small-team volume the aggregate is cheap.
--
-- The unique constraint is what makes a reaction idempotent — reacting twice
-- with the same emoji is the same fact, not two of them.
create table if not exists public.message_reactions (
  id         uuid        primary key default gen_random_uuid(),
  message_id uuid        not null references public.messages(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)      on delete cascade,
  emoji      text        not null check (length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx on public.message_reactions (message_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Reaching a reaction is reaching the message it hangs off, so every policy
-- defers to can_access_channel() through a join back to messages. Writing one
-- additionally requires it to be your own.
alter table public.message_reactions enable row level security;

drop policy if exists "reactions readable by channel members"  on public.message_reactions;
drop policy if exists "reactions insertable by channel members" on public.message_reactions;
drop policy if exists "reactions deletable by owner"            on public.message_reactions;

create policy "reactions readable by channel members" on public.message_reactions
  for select using (
    exists (
      select 1 from public.messages m
       where m.id = message_reactions.message_id
         and public.can_access_channel(m.channel_id, auth.uid())
    )
  );

create policy "reactions insertable by channel members" on public.message_reactions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
       where m.id = message_reactions.message_id
         and m.deleted_at is null
         and public.can_access_channel(m.channel_id, auth.uid())
    )
  );

-- Only your own reaction, and no UPDATE policy at all: changing an emoji is
-- remove-then-add, which keeps created_at honest about when a reaction landed.
create policy "reactions deletable by owner" on public.message_reactions
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- toggle_reaction()
-- ---------------------------------------------------------------------------
-- Add if absent, remove if present, in one round trip.
--
-- SECURITY INVOKER (the default) is deliberate: the policies above still
-- apply, so this function grants nothing the caller could not do with a plain
-- insert or delete. It exists to remove a race, not to bypass a rule — a
-- client that reads "have I reacted?" and then writes can double-fire on a
-- fast double-click, and the unique constraint would turn the second write
-- into an error the user cannot act on.
--
-- Returns true when the reaction is now present, false when it was removed.
create or replace function public.toggle_reaction(
  p_message_id uuid,
  p_emoji      text
)
returns boolean
language plpgsql
volatile
as $$
declare
  v_deleted int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from public.message_reactions
   where message_id = p_message_id
     and user_id    = auth.uid()
     and emoji      = p_emoji;

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    return false;
  end if;

  -- No prior row: add one. A unique violation here means a concurrent request
  -- inserted the same reaction first, which is the state the caller wanted
  -- anyway, so report success rather than surfacing a conflict.
  begin
    insert into public.message_reactions (message_id, user_id, emoji)
    values (p_message_id, auth.uid(), p_emoji);
  exception
    when unique_violation then
      return true;
  end;

  return true;
end;
$$;

comment on function public.toggle_reaction(uuid, text) is
  'Adds the calling user''s reaction to a message, or removes it if already present. Returns true when the reaction is now set. Runs as the caller, so message_reactions RLS still applies.';

-- ---------------------------------------------------------------------------
-- messages_with_counts
-- ---------------------------------------------------------------------------
-- One row per message carrying its reaction tallies and reply count, so the
-- history route does not issue a follow-up query per message.
--
-- security_invoker = true is the important part: without it the view would run
-- as its owner and hand every caller rows the messages policy would have
-- denied. With it, the base-table policies from 012 still decide what is
-- visible, and the view is a convenience rather than a hole.
create or replace view public.messages_with_counts
with (security_invoker = true) as
select
  m.*,
  coalesce(
    (
      select jsonb_object_agg(t.emoji, t.cnt)
        from (
          select r.emoji, count(*) as cnt
            from public.message_reactions r
           where r.message_id = m.id
           group by r.emoji
        ) t
    ),
    '{}'::jsonb
  ) as reaction_counts,
  coalesce(
    (
      select jsonb_agg(distinct r2.emoji)
        from public.message_reactions r2
       where r2.message_id = m.id
         and r2.user_id = auth.uid()
    ),
    '[]'::jsonb
  ) as my_reactions,
  (
    select count(*)
      from public.messages replies
     where replies.parent_message_id = m.id
       and replies.deleted_at is null
  ) as reply_count,
  (
    select max(replies.created_at)
      from public.messages replies
     where replies.parent_message_id = m.id
       and replies.deleted_at is null
  ) as last_reply_at
from public.messages m;

comment on view public.messages_with_counts is
  'Messages plus per-emoji reaction tallies, the caller''s own reactions, and thread reply counts. security_invoker so the messages RLS policies still apply.';

commit;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
-- begin;
--   drop view if exists public.messages_with_counts;
--   drop function if exists public.toggle_reaction(uuid, text);
--   drop policy if exists "reactions readable by channel members"  on public.message_reactions;
--   drop policy if exists "reactions insertable by channel members" on public.message_reactions;
--   drop policy if exists "reactions deletable by owner"            on public.message_reactions;
--   drop table if exists public.message_reactions;
-- commit;
