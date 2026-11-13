-- FITM shared tracker v2: additive schema, no DROP and no changes to original tracker_progress.
-- Applied in Supabase as migration fitm_shared_tracker_evidence_v1.
-- For a fresh project run the original tracker_editors authorization setup first.
create table if not exists public.tracker_custom_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description)<=2000),
  planned_weeks integer not null default 10 check (planned_weeks between 1 and 104),
  slug text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.tracker_custom_weeks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tracker_custom_projects(id) on delete cascade,
  position integer not null check (position between 1 and 999),
  title text not null check (length(btrim(title)) between 1 and 160),
  goal text not null default '' check (length(goal)<=3000),
  together text not null default '' check (length(together)<=3000),
  deliverable text not null default '' check (length(deliverable)<=3000),
  created_at timestamptz not null default now(),
  unique(project_id,position)
);
create table if not exists public.tracker_custom_tasks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.tracker_custom_weeks(id) on delete cascade,
  position integer not null default 1 check (position between 1 and 99999),
  reference text not null default '' check (length(reference)<=100),
  title text not null check (length(btrim(title)) between 1 and 250),
  role text not null default '' check (length(role)<=150),
  description text not null default '' check (length(description)<=15000),
  details jsonb not null default '[]'::jsonb check (jsonb_typeof(details)='array'),
  source_key text unique,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  note text not null default '' check (length(note)<=10000),
  updated_at timestamptz not null default now()
);
alter table public.tracker_custom_projects add column if not exists planned_weeks integer not null default 10;
alter table public.tracker_custom_projects add column if not exists slug text;
alter table public.tracker_custom_tasks add column if not exists details jsonb not null default '[]'::jsonb;
alter table public.tracker_custom_tasks add column if not exists source_key text;
create unique index if not exists tracker_custom_projects_slug_idx on public.tracker_custom_projects(slug);
create unique index if not exists tracker_custom_tasks_source_key_idx on public.tracker_custom_tasks(source_key);
create index if not exists tracker_custom_weeks_project_idx on public.tracker_custom_weeks(project_id,position);
create index if not exists tracker_custom_tasks_week_idx on public.tracker_custom_tasks(week_id,position);

create table if not exists public.tracker_custom_evidence (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tracker_custom_tasks(id) on delete cascade,
  file_path text not null unique check(length(file_path) between 10 and 500),
  file_name text not null check(length(file_name) between 1 and 250),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  bytes bigint not null check (bytes between 1 and 5242880),
  caption text not null default '' check(length(caption)<=500),
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists tracker_custom_evidence_task_idx on public.tracker_custom_evidence(task_id,created_at);
alter table public.tracker_custom_projects enable row level security;
alter table public.tracker_custom_weeks enable row level security;
alter table public.tracker_custom_tasks enable row level security;
alter table public.tracker_custom_evidence enable row level security;
revoke all on public.tracker_custom_projects,public.tracker_custom_weeks,
 public.tracker_custom_tasks,public.tracker_custom_evidence from anon,authenticated;
grant select on public.tracker_custom_projects,public.tracker_custom_weeks,
 public.tracker_custom_tasks to anon,authenticated;
grant insert,update,delete on public.tracker_custom_projects,public.tracker_custom_weeks,
 public.tracker_custom_tasks to authenticated;
grant select,insert,update,delete on public.tracker_custom_evidence to authenticated;
do $$
declare tab text;
declare allowed text:='exists (select 1 from public.tracker_editors where user_id=(select auth.uid()))';
begin
  foreach tab in array array['tracker_custom_projects','tracker_custom_weeks','tracker_custom_tasks','tracker_custom_evidence'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=tab and policyname='fitm_read') then
      if tab='tracker_custom_evidence' then
        execute format('create policy fitm_read on public.%I for select to authenticated using (true)',tab);
      else
        execute format('create policy fitm_read on public.%I for select to anon,authenticated using (true)',tab);
      end if;
    end if;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=tab and policyname='fitm_insert') then
      execute format('create policy fitm_insert on public.%I for insert to authenticated with check (%s)',tab,allowed);
    end if;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=tab and policyname='fitm_update') then
      execute format('create policy fitm_update on public.%I for update to authenticated using (%s) with check (%s)',tab,allowed,allowed);
    end if;
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=tab and policyname='fitm_delete') then
      execute format('create policy fitm_delete on public.%I for delete to authenticated using (%s)',tab,allowed);
    end if;
  end loop;
end $$;
-- Bucket private, allow only JPG/PNG/WebP under 5 MB.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fitm-evidence','fitm-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
do $$
begin
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='fitm_evidence_read') then
   create policy fitm_evidence_read on storage.objects for select to authenticated
     using(bucket_id='fitm-evidence');
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='fitm_evidence_upload') then
   create policy fitm_evidence_upload on storage.objects for insert to authenticated
   with check (bucket_id='fitm-evidence'
    and exists(select 1 from public.tracker_editors where user_id=(select auth.uid()))
    and exists(select 1 from public.tracker_custom_tasks
      where id::text=(storage.foldername(name))[1]));
 end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='fitm_evidence_delete') then
   create policy fitm_evidence_delete on storage.objects for delete to authenticated
   using(bucket_id='fitm-evidence'
    and exists(select 1 from public.tracker_editors where user_id=(select auth.uid())));
 end if;
end $$;
do $$
declare tab text;
begin
 foreach tab in array array['tracker_custom_projects','tracker_custom_weeks','tracker_custom_tasks','tracker_custom_evidence'] loop
  if not exists(select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename=tab) then
   execute format('alter publication supabase_realtime add table public.%I',tab);
  end if;
 end loop;
end $$;
