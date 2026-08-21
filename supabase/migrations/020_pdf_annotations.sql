-- ===========================================================================
-- PDF ANNOTATIONS — Luman v2 desktop, Files app
-- ===========================================================================
--
-- Live markup on an uploaded PDF: text highlights, freehand pen strokes and
-- pinned sticky notes, shared between everyone in the organisation who has
-- the file open.
--
-- WHY A ROW PER ANNOTATION
--   Whiteboards store the whole scene as one JSONB document (migration 014),
--   which is right there: a board is one shared surface anyone may erase from.
--   Annotations are different — each one belongs to the person who made it and
--   only they may delete it. That is a per-row rule, so it needs per-row
--   ownership for RLS to express it. A single JSONB blob could not.
--
-- COORDINATES
--   Positions are stored in PDF page space, normalised 0..1 against page
--   width/height, never screen pixels. A highlight at (0.5, 0.3) lands in the
--   same place at any zoom level, window size or device pixel ratio — the same
--   lesson migration 014's whiteboard world-coordinates comment records.
--
-- TRANSPORTS
--   broadcast   new and deleted annotations, so marks appear live
--   this table  the durable copy, so a reload or late joiner gets everything
--
-- ROLLBACK is at the bottom of this file.
-- ===========================================================================

begin;

create table if not exists public.pdf_annotations (
  id            uuid        primary key default gen_random_uuid(),
  file_id       uuid        not null references public.org_files(id) on delete cascade,
  page          integer     not null check (page >= 1),
  kind          text        not null check (kind in ('highlight', 'draw', 'note')),
  color         text        not null,

  -- Normalised 0..1 page-space geometry. Shape depends on `kind`:
  --   highlight  { rects: [{x, y, w, h}, ...] }  one rect per line of text
  --   draw       { points: [[x, y], ...] }       a single freehand stroke
  --   note       { x, y }                        the pin's anchor
  geometry      jsonb       not null,

  -- Sticky note body. Null for highlights and strokes.
  body          text        check (body is null or length(body) <= 2000),

  created_by    uuid                 references auth.users(id) on delete set null,
  author_name   text        not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists pdf_annotations_file_page_idx
  on public.pdf_annotations (file_id, page);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Readable and writable by anyone who can already see the underlying file, so
-- access follows the file rather than being a second thing to keep in sync.
alter table public.pdf_annotations enable row level security;

drop policy if exists "pdf annotations readable with file"   on public.pdf_annotations;
drop policy if exists "pdf annotations insertable by members" on public.pdf_annotations;
drop policy if exists "pdf annotations deletable by author"   on public.pdf_annotations;

create policy "pdf annotations readable with file" on public.pdf_annotations
  for select using (
    exists (
      select 1
        from org_files f
        join organization_members om on om.organization_id = f.organization_id
       where f.id = pdf_annotations.file_id
         and om.user_id = auth.uid()
    )
  );

create policy "pdf annotations insertable by members" on public.pdf_annotations
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1
        from org_files f
        join organization_members om on om.organization_id = f.organization_id
       where f.id = pdf_annotations.file_id
         and om.user_id = auth.uid()
    )
  );

-- Only the author may delete. Unlike a whiteboard stroke, an annotation is
-- attributed to a person and shown with their name — letting anyone remove
-- someone else's note would be deleting their words, not tidying a shared
-- surface.
create policy "pdf annotations deletable by author" on public.pdf_annotations
  for delete using (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Live marks travel over broadcast (transient, no DB write on the hot path),
-- but the table is published too so a delete from another session removes the
-- mark everywhere without a refresh. Realtime respects RLS, so the SELECT
-- policy above governs who receives what.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pdf_annotations'
  ) then
    alter publication supabase_realtime add table public.pdf_annotations;
  end if;
end $$;

commit;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--   begin;
--   alter publication supabase_realtime drop table public.pdf_annotations;
--   drop policy if exists "pdf annotations deletable by author"   on public.pdf_annotations;
--   drop policy if exists "pdf annotations insertable by members" on public.pdf_annotations;
--   drop policy if exists "pdf annotations readable with file"    on public.pdf_annotations;
--   drop table if exists public.pdf_annotations;
--   commit;
