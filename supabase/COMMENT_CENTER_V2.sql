-- Requires PUBLIC_EVIDENCE_COMMENTS.sql already applied.
-- Existing comments remain intact. Apply manually before merging PR.
begin;
alter table public.tracker_custom_comments add column if not exists parent_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='fitm_comments_id_task_unique' and conrelid='public.tracker_custom_comments'::regclass) then
  alter table public.tracker_custom_comments add constraint fitm_comments_id_task_unique unique(id,task_id);
 end if;
 if not exists(select 1 from pg_constraint where conname='fitm_comments_parent_same_task' and conrelid='public.tracker_custom_comments'::regclass) then
  alter table public.tracker_custom_comments add constraint fitm_comments_parent_same_task foreign key(parent_id,task_id) references public.tracker_custom_comments(id,task_id) on delete cascade;
 end if;
end $$;
create index if not exists fitm_comments_parent_idx on public.tracker_custom_comments(parent_id);
grant insert(parent_id) on public.tracker_custom_comments to anon,authenticated;
-- One level of replies. The UI also redirects reply-to-reply to its root.
create or replace function public.fitm_comment_parent_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.parent_id is not null and not exists(
  select 1 from public.tracker_custom_comments c where c.id=new.parent_id and c.task_id=new.task_id and c.parent_id is null
 ) then raise exception 'Reply must reference a root comment in the same task'; end if;
 return new;
end;
$$;
revoke execute on function public.fitm_comment_parent_guard() from public,anon,authenticated;
drop trigger if exists fitm_comment_parent_guard on public.tracker_custom_comments;
create trigger fitm_comment_parent_guard before insert on public.tracker_custom_comments for each row execute function public.fitm_comment_parent_guard();

create table if not exists public.tracker_comment_reads (
 user_id uuid not null references auth.users(id) on delete cascade,
 comment_id uuid not null references public.tracker_custom_comments(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(user_id,comment_id)
);
create index if not exists fitm_comment_reads_comment_idx on public.tracker_comment_reads(comment_id);
alter table public.tracker_comment_reads enable row level security;
revoke all on public.tracker_comment_reads from public,anon,authenticated;
grant select,delete on public.tracker_comment_reads to authenticated;
grant insert(user_id,comment_id) on public.tracker_comment_reads to authenticated;
drop policy if exists fitm_reads_select on public.tracker_comment_reads;
create policy fitm_reads_select on public.tracker_comment_reads for select to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.tracker_editors e where e.user_id=(select auth.uid()))
);
drop policy if exists fitm_reads_insert on public.tracker_comment_reads;
create policy fitm_reads_insert on public.tracker_comment_reads for insert to authenticated with check (
 user_id=(select auth.uid()) and exists(select 1 from public.tracker_editors e where e.user_id=(select auth.uid()))
);
drop policy if exists fitm_reads_delete on public.tracker_comment_reads;
create policy fitm_reads_delete on public.tracker_comment_reads for delete to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.tracker_editors e where e.user_id=(select auth.uid()))
);
-- Publish public comments only, never private read receipts.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tracker_custom_comments') then
  alter publication supabase_realtime add table public.tracker_custom_comments;
 end if;
end $$;
commit;

select tablename,policyname,roles,cmd from pg_policies where schemaname='public' and tablename='tracker_comment_reads' order by policyname;
select pubname,tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='tracker_custom_comments';
