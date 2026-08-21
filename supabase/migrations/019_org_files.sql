-- ===========================================================================
-- ORGANIZATION FILES — Luman v2 desktop "Files" app (GodMode)
-- ===========================================================================
--
-- Lets an organisation upload a capped number of reference files (PDFs and
-- common media) that any member can browse and open from the desktop. Binary
-- bytes live in Vercel Blob — this table is metadata plus the blob URL, the
-- same split /api/upload already uses for note images (see image-upload.ts).
--
-- WHAT THIS TOUCHES
--   Adds org_files (new table) and organizations.file_limit (new column with
--   a default, so no existing row needs a backfill). No existing table,
--   policy or function is altered or dropped.
--
-- FILE LIMIT
--   organizations.file_limit defaults to 10 and is enforced by the app layer
--   (lib/db/org-files.ts checks count() before insert) rather than a DB
--   trigger, matching how other per-org caps in this schema are enforced.
--   To raise a specific org's limit:
--
--     update public.organizations set file_limit = 25 where slug = 'acme';
--
-- ROLLBACK is at the bottom of this file.
-- ===========================================================================

begin;

alter table public.organizations
  add column if not exists file_limit integer not null default 10;

comment on column public.organizations.file_limit is
  'Max rows in org_files for this organisation. Raise per-org via SQL: update organizations set file_limit = N where id = ...';

-- ---------------------------------------------------------------------------
-- org_files
-- ---------------------------------------------------------------------------
create table if not exists public.org_files (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  name             text        not null check (length(trim(name)) between 1 and 200),
  kind             text        not null check (kind in ('pdf', 'image', 'audio', 'video')),
  content_type     text        not null,
  size_bytes       bigint      not null check (size_bytes >= 0),
  blob_url         text        not null,
  uploaded_by      uuid                 references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists org_files_org_idx on public.org_files (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.org_files enable row level security;

drop policy if exists "org files readable by members"   on public.org_files;
drop policy if exists "org files insertable by members"  on public.org_files;
drop policy if exists "org files deletable by members"   on public.org_files;

create policy "org files readable by members" on public.org_files
  for select using (
    exists (
      select 1 from organization_members om
       where om.organization_id = org_files.organization_id
         and om.user_id = auth.uid()
    )
  );

create policy "org files insertable by members" on public.org_files
  for insert with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from organization_members om
       where om.organization_id = org_files.organization_id
         and om.user_id = auth.uid()
    )
  );

-- Any member can delete, not just the uploader: a shared file library where
-- only the original uploader can clean up a stale file is a library nobody
-- can tidy once that person leaves.
create policy "org files deletable by members" on public.org_files
  for delete using (
    exists (
      select 1 from organization_members om
       where om.organization_id = org_files.organization_id
         and om.user_id = auth.uid()
    )
  );

commit;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--   begin;
--   drop policy if exists "org files deletable by members"  on public.org_files;
--   drop policy if exists "org files insertable by members" on public.org_files;
--   drop policy if exists "org files readable by members"   on public.org_files;
--   drop table if exists public.org_files;
--   alter table public.organizations drop column if exists file_limit;
--   commit;
