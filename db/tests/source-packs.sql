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
-- Model Supabase's broad default table grants before tightening editable columns.
grant update on public.tn_packs to anon, authenticated;
\ir ../migration-004-pack-editing.sql
create function public.test_assert(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select test_assert(not exists (
  select 1 from unnest(array['id','owner_id','created_at','revision','updated_at']) c
  where has_column_privilege('authenticated','public.tn_packs',c,'UPDATE')
),'Supabase default grants cannot leave identity or revision caller-editable');
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
insert into public.tn_sources values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','link');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ declare target_id uuid; original_revision integer; next_revision integer; begin
  select id,revision into target_id,original_revision from tn_packs where title='Public';
  next_revision := tn_update_pack(target_id,original_revision,'Edited','New reason','policy',array['primary'],false,
    '[{"source_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","note":"First"},{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","note":"Second"}]');
  perform test_assert(next_revision>original_revision,'save advances revision');
  perform test_assert((select title='Edited' and description='New reason' and category='policy' and tags=array['primary'] and not is_public from tn_packs where id=target_id),'metadata and visibility saved');
  perform test_assert((select array_agg(source_id order by rank)=array['cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid] from tn_pack_sources where tn_pack_sources.pack_id=target_id),'ordered replacement saved');
  perform test_assert((select note='First' from tn_pack_sources where tn_pack_sources.pack_id=target_id and rank=1),'source note saved');
  begin
    perform tn_update_pack(target_id,original_revision,'Stale','','policy','{}',true,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'stale edit unexpectedly accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform tn_delete_pack(target_id,original_revision);
    raise exception 'stale delete unexpectedly accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform tn_update_pack(target_id,next_revision,'Bad','','policy','{}',true,'[{"source_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}]');
    raise exception 'file replacement unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform tn_update_pack(target_id,next_revision,'Bad','','policy','{}',true,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'duplicate replacement unexpectedly accepted';
  exception when unique_violation then null; end;
  begin
    perform tn_update_pack(target_id,next_revision,'Empty','','policy','{}',false,'[]');
    raise exception 'empty replacement unexpectedly accepted';
  exception when invalid_parameter_value then null; end;
  perform test_assert((select title='Edited' and revision=next_revision and not is_public from tn_packs where id=target_id),'failed saves roll back metadata and revision');
  perform test_assert((select count(*)=2 from tn_pack_sources where tn_pack_sources.pack_id=target_id),'failed saves retain entries');
  begin
    update tn_packs set owner_id='22222222-2222-4222-8222-222222222222' where id=target_id;
    raise exception 'owner transfer unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  -- Direct owner entry changes invalidate previously opened drafts as well.
  delete from tn_pack_sources where tn_pack_sources.pack_id=target_id and rank=1;
  perform test_assert((select revision>next_revision from tn_packs where id=target_id),'direct entry write advances revision');
  update tn_packs set is_public=true where id=target_id;
end $$;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ declare target uuid; rev integer; begin
  select id,revision into target,rev from tn_packs where title='Edited';
  begin
    perform tn_update_pack(target,rev,'Hijack','','policy','{}',true,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'cross-owner edit unexpectedly accepted';
  exception when sqlstate 'PT404' then null; end;
  begin
    perform tn_delete_pack(target,rev);
    raise exception 'cross-owner delete unexpectedly accepted';
  exception when sqlstate 'PT404' then null; end;
  update tn_packs set title='Hijack' where id=target;
  delete from tn_packs where id=target;
  delete from tn_pack_sources where pack_id=target;
  perform test_assert((select title='Edited' from tn_packs where id=target),'RLS rejects cross-owner direct edits/deletes');
  perform test_assert((select count(*)=1 from tn_pack_sources where pack_id=target),'RLS rejects cross-owner entry deletion');
end $$;
set role anon;
set request.jwt.claim.sub = '';
do $$ declare target uuid; rev integer; begin
  select id,revision into target,rev from tn_packs where title='Edited';
  begin
    perform tn_delete_pack(target,rev);
    raise exception 'anonymous delete unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform tn_update_pack(target,rev,'Anonymous','','policy','{}',true,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'anonymous edit unexpectedly accepted';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ declare target uuid; rev integer; begin
  select id,revision into target,rev from tn_packs where title='Edited';
  update tn_packs set is_public=false where id=target;
end $$;
set role anon;
set request.jwt.claim.sub = '';
select test_assert((select count(*)=0 from tn_packs),'privacy change hides public pack');
select test_assert((select count(*)=0 from tn_pack_sources),'privacy change hides entries');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ declare target uuid; rev integer; begin
  select id,revision into target,rev from tn_packs where title='Edited';
  perform tn_delete_pack(target,rev);
  perform test_assert(not exists(select 1 from tn_packs where id=target),'owner delete removes pack');
  perform test_assert(not exists(select 1 from tn_pack_sources where pack_id=target),'owner delete removes pack entries');
  perform test_assert((select count(*)=3 from tn_sources),'deleting pack preserves shared sources');
end $$;
reset role;
select test_assert((select count(*)=1 from tn_packs where title='Copy'),'editing/deletion preserves independent copies');
select 'Source pack RLS and transaction checks passed' as result;

-- Attributed forks: immutable origins, readable public parents, private-link isolation.
\ir ../migration-005-pack-ancestry.sql
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
insert into tn_packs(id,owner_id,title,category,is_public) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',auth.uid(),'Fork parent','security',true),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',auth.uid(),'Secret parent','security',false);
insert into tn_pack_sources(pack_id,source_id,rank,note) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'Original'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'Private');
select tn_fork_pack(id,revision,'Public child of private parent','','security','{}',true,
 '[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","note":"Independent"}]') from tn_packs where title='Secret parent';
select test_assert((select count(*)=1 from tn_pack_origins),'owner sees own private-parent attribution');
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select test_assert((select count(*)=0 from tn_pack_origins),'public child does not expose private parent to another account');
do $$ declare parent uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; rev integer; child uuid; before_count integer; begin
  -- Public read permission does not authorize an invoker row lock under owner RLS.
  perform id from tn_packs where id=parent for share;
  perform test_assert(not found,'public-parent lock does not broaden owner RLS');
  select revision into rev from tn_packs where id=parent;
  child := tn_fork_pack(parent,rev,'Attributed child','','security','{}',true,
    '[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","note":"My version"}]');
  perform test_assert((select owner_id=auth.uid() from tn_packs where id=child),'fork belongs to caller');
  perform test_assert((select parent_id=parent and parent_revision=rev from tn_pack_origins where pack_id=child),'fork captures exact parent and revision');
  update tn_packs set title='My independent copy' where id=child;
  perform test_assert((select title='Fork parent' and revision=rev from tn_packs where id=parent),'child editing preserves parent');
  select count(*) into before_count from tn_packs;
  begin
    perform tn_fork_pack(parent,rev-1,'Stale','','security','{}',false,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'stale fork accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform tn_fork_pack('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',2,'Leaked','','security','{}',true,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'private fork accepted';
  exception when sqlstate 'PT404' then null; end;
  begin
    perform tn_fork_pack('ffffffff-ffff-4fff-8fff-ffffffffffff',2,'Missing','','security','{}',true,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'missing parent accepted';
  exception when sqlstate 'PT404' then null; end;
  begin
    perform tn_fork_pack(parent,rev,'File','','security','{}',false,'[{"source_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}]');
    raise exception 'file fork accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform tn_fork_pack(parent,rev,'Duplicate','','security','{}',false,'[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]');
    raise exception 'duplicate fork accepted';
  exception when unique_violation then null; end;
  perform test_assert((select count(*)=before_count from tn_packs),'failed forks roll back child creation');
  perform test_assert((select count(*)=1 from tn_pack_origins),'failed forks create no origins');
  begin
    update tn_pack_origins set parent_revision=999 where pack_id=child;
    raise exception 'origin update accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from tn_pack_origins where pack_id=child;
    raise exception 'origin deletion accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into tn_pack_origins(pack_id,parent_id,parent_revision) values(child,parent,rev);
    raise exception 'origin spoof accepted';
  exception when insufficient_privilege then null; end;
end $$;
select tn_fork_pack(id,revision,'Private attributed child','','security','{}',false,
 '[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}]') from tn_packs where title='Fork parent';
set role anon;
set request.jwt.claim.sub = '';
select test_assert((select count(*)=1 from tn_pack_origins),'anonymous only reads ancestry between public packs');
do $$ begin
  begin
    perform tn_fork_pack('dddddddd-dddd-4ddd-8ddd-dddddddddddd',2,'Anon','','security','{}',true,'[]');
    raise exception 'anonymous fork accepted';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update tn_packs set is_public=false,title='Now private' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select test_assert((select count(*)=0 from tn_pack_origins),'child owner cannot read now-private parent linkage');
select test_assert(exists(select 1 from tn_packs where title='My independent copy'),'privacy change preserves copy');
set role anon;
set request.jwt.claim.sub = '';
select test_assert((select count(*)=0 from tn_pack_origins),'privacy change hides attribution through direct DB reads');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update tn_packs set is_public=true where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select test_assert((select parent_revision=2 from tn_pack_origins where parent_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'parent edits never rewrite captured revision');
delete from tn_packs where id in ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
reset role;
select test_assert((select count(*)=0 from tn_pack_origins),'deletion removes ancestry linkage');
select test_assert((select count(*)=2 from tn_packs where title in ('My independent copy','Public child of private parent')),'parent deletion preserves independent children');
select 'Fork attribution privacy and independence checks passed' as result;
