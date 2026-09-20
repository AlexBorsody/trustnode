-- Run only in an empty disposable PostgreSQL database, never production.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
create table public.tn_sources(id uuid primary key, kind text not null);
insert into public.tn_sources values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','link'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','file');
alter table public.tn_sources enable row level security;
create policy "read sources" on public.tn_sources for select using(true);
grant select on public.tn_sources to anon,authenticated;
\ir ../migration-003-source-packs.sql
create function public.test_assert(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.tn_create_pack('Private','Reason','security','{}',false,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","note":"standard"}]');
select public.tn_create_pack('Public','Reason','security','{}',true,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","note":"standard"}]');
select test_assert((select count(*) = 2 from tn_packs),'owner reads own private pack');
select test_assert((select count(*) = 2 from tn_pack_sources),'owner reads private entries');
do $$ begin
  begin
    perform tn_create_pack('Invalid','Reason','security','{}',false,'[{"source_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","note":"file"}]');
    raise exception 'file source unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  perform test_assert((select count(*)=2 from tn_packs),'failed save rolled back parent');
  begin
    perform tn_create_pack('Duplicate','Reason','security','{}',false,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'duplicate unexpectedly accepted';
  exception when unique_violation then null; end;
  perform test_assert((select count(*)=2 from tn_packs),'duplicate save rolled back parent');
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select test_assert((select count(*)=1 from tn_packs),'other user cannot read private pack');
select test_assert((select count(*)=1 from tn_pack_sources),'other user cannot read private entries');
do $$ begin
  begin
    insert into tn_packs(owner_id,title,category) values('11111111-1111-4111-8111-111111111111','Spoof','security');
    raise exception 'spoofed owner unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into tn_pack_sources(pack_id,source_id,rank,note)
      select id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,'attack' from tn_packs where title='Public';
    raise exception 'cross-owner entry unexpectedly accepted';
  exception when insufficient_privilege then null; end;
end $$;
-- Copying a visible public pack produces an independently owned private pack.
select public.tn_create_pack('Copy','Reason','security','{}',false,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","note":"my reasoning"}]');
select test_assert((select count(*)=2 from tn_packs),'copier sees public and own private copy');
set role anon;
set request.jwt.claim.sub = '';
select test_assert((select count(*)=1 from tn_packs),'anonymous sees only public packs');
select test_assert((select count(*)=1 from tn_pack_sources),'anonymous sees only public entries');
do $$ begin
  begin
    perform tn_create_pack('Anonymous','Reason','security','{}',true,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'anonymous creation unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'Source pack RLS and transaction checks passed' as result;
