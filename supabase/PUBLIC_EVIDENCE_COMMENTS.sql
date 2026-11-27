-- Run once in the Supabase SQL Editor AFTER reviewing the PR.
-- All tracker notes, registered evidence images and guest comments become public.
-- The bucket stays private. Only evidence attached to an existing tracker task
-- can be read by guests; upload/delete policies for editors are unchanged.
begin;

grant select (id,task_id,file_path,file_name,mime_type,bytes,caption,created_at)
  on public.tracker_custom_evidence to anon;
drop policy if exists fitm_guest_evidence_read on public.tracker_custom_evidence;
create policy fitm_guest_evidence_read on public.tracker_custom_evidence
  for select to anon using (
    exists (select 1 from public.tracker_custom_tasks t where t.id=task_id)
  );

drop policy if exists fitm_guest_storage_read on storage.objects;
create policy fitm_guest_storage_read on storage.objects
  for select to anon using (
    bucket_id='fitm-evidence' and exists (
      select 1 from public.tracker_custom_evidence e
      where e.file_path=storage.objects.name
    )
  );

create table if not exists public.tracker_custom_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tracker_custom_tasks(id) on delete cascade,
  author_name text not null default 'ผู้เยี่ยมชม'
    check (char_length(btrim(author_name)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists tracker_custom_comments_task_date_idx
  on public.tracker_custom_comments(task_id,created_at desc);
alter table public.tracker_custom_comments enable row level security;
revoke all on public.tracker_custom_comments from public,anon,authenticated;
grant select on public.tracker_custom_comments to anon,authenticated;
grant insert(task_id,author_name,body) on public.tracker_custom_comments to anon,authenticated;
grant delete on public.tracker_custom_comments to authenticated;

drop policy if exists fitm_comments_read on public.tracker_custom_comments;
create policy fitm_comments_read on public.tracker_custom_comments
  for select to anon,authenticated using (true);
drop policy if exists fitm_comments_post on public.tracker_custom_comments;
create policy fitm_comments_post on public.tracker_custom_comments
  for insert to anon,authenticated with check (
    exists (select 1 from public.tracker_custom_tasks t where t.id=task_id)
  );
drop policy if exists fitm_comments_editor_delete on public.tracker_custom_comments;
create policy fitm_comments_editor_delete on public.tracker_custom_comments
  for delete to authenticated using (
    exists (select 1 from public.tracker_editors where user_id=(select auth.uid()))
  );

-- Server-side basic flood control: 10 submissions per task per minute across
-- all visitors. Not a per-person rate limit or CAPTCHA.
create or replace function public.fitm_comment_rate_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.task_id::text, 98341));
  if (select count(*) from public.tracker_custom_comments
      where task_id=new.task_id and created_at >= now()-interval '1 minute') >= 10 then
    raise exception 'Too many comments for this task. Please try again in one minute.';
  end if;
  return new;
end;
$$;
revoke execute on function public.fitm_comment_rate_guard() from public,anon,authenticated;
drop trigger if exists fitm_comment_rate_guard on public.tracker_custom_comments;
create trigger fitm_comment_rate_guard before insert on public.tracker_custom_comments
  for each row execute function public.fitm_comment_rate_guard();
commit;

-- Read-only verification after applying:
select schemaname,tablename,policyname,roles,cmd from pg_policies
where policyname in ('fitm_guest_evidence_read','fitm_guest_storage_read',
  'fitm_comments_read','fitm_comments_post','fitm_comments_editor_delete');
