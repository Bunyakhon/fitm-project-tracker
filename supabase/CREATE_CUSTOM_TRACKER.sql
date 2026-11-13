-- CoopConnect customizable tracker template.
-- Run ONCE in Supabase SQL Editor before opening template.html.
-- Keeps existing tracker_progress, tracker_editors, and static 68 scope untouched.
-- Public can READ projects, weeks, tasks and notes. Only users in tracker_editors can WRITE.

create table if not exists public.tracker_custom_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tracker_custom_weeks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tracker_custom_projects(id) on delete cascade,
  position integer not null check (position between 1 and 999),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  goal text not null default '' check (char_length(goal) <= 3000),
  together text not null default '' check (char_length(together) <= 3000),
  deliverable text not null default '' check (char_length(deliverable) <= 3000),
  created_at timestamptz not null default now(),
  unique (project_id, position)
);

create table if not exists public.tracker_custom_tasks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.tracker_custom_weeks(id) on delete cascade,
  position integer not null default 1 check (position between 1 and 99999),
  reference text not null default '' check (char_length(reference) <= 100),
  title text not null check (char_length(btrim(title)) between 1 and 250),
  role text not null default '' check (char_length(role) <= 150),
  description text not null default '' check (char_length(description) <= 15000),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  note text not null default '' check (char_length(note) <= 10000),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_custom_weeks_project_idx
  on public.tracker_custom_weeks (project_id, position);
create index if not exists tracker_custom_tasks_week_idx
  on public.tracker_custom_tasks (week_id, position);

alter table public.tracker_custom_projects enable row level security;
alter table public.tracker_custom_weeks enable row level security;
alter table public.tracker_custom_tasks enable row level security;

-- Supabase projects can auto-grant broader privileges to new public tables.
revoke all on public.tracker_custom_projects, public.tracker_custom_weeks,
  public.tracker_custom_tasks from anon, authenticated;
grant select on public.tracker_custom_projects, public.tracker_custom_weeks,
  public.tracker_custom_tasks to anon, authenticated;
grant insert, update, delete on public.tracker_custom_projects, public.tracker_custom_weeks,
  public.tracker_custom_tasks to authenticated;

-- Public SELECT; editor-only INSERT/UPDATE/DELETE.
-- These policies are created idempotently for a fresh or retried setup.
do $$
declare tab text;
declare editor_check text := 'exists (select 1 from public.tracker_editors where user_id = (select auth.uid()))';
begin
  foreach tab in array array['tracker_custom_projects','tracker_custom_weeks','tracker_custom_tasks'] loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public'
      and tablename = tab and policyname = 'custom_public_read'
    ) then
      execute format('create policy custom_public_read on public.%I for select to anon, authenticated using (true)', tab);
    end if;
    if not exists (
      select 1 from pg_policies where schemaname = 'public'
      and tablename = tab and policyname = 'custom_editor_insert'
    ) then
      execute format('create policy custom_editor_insert on public.%I for insert to authenticated with check (%s)', tab, editor_check);
    end if;
    if not exists (
      select 1 from pg_policies where schemaname = 'public'
      and tablename = tab and policyname = 'custom_editor_update'
    ) then
      execute format('create policy custom_editor_update on public.%I for update to authenticated using (%s) with check (%s)', tab, editor_check, editor_check);
    end if;
    if not exists (
      select 1 from pg_policies where schemaname = 'public'
      and tablename = tab and policyname = 'custom_editor_delete'
    ) then
      execute format('create policy custom_editor_delete on public.%I for delete to authenticated using (%s)', tab, editor_check);
    end if;
  end loop;
end $$;

-- Enable Supabase Realtime for the 3 new tables, avoiding duplicate publication errors.
do $$
declare tab text;
begin
  foreach tab in array array['tracker_custom_projects','tracker_custom_weeks','tracker_custom_tasks'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=tab
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tab);
    end if;
  end loop;
end $$;
