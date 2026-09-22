-- Empty disposable database only. Reuse the existing ownership/ancestry setup.
\ir source-packs.sql
alter table tn_sources add column title text not null default 'Reference',
  add column url text, add column status text not null default 'ready';
update tn_sources set url = 'https://Example.org:443/reference#section' where kind = 'link';
create table tn_categories(id uuid primary key default gen_random_uuid(), slug text unique not null,
  name text not null, description text, created_at timestamptz not null default now());
alter table tn_categories enable row level security;
create policy "public read" on tn_categories for select using(true);
create policy "auth insert" on tn_categories for insert with check(true);
grant all on tn_categories to anon,authenticated;
insert into tn_categories(slug,name) values('security','Security');
\ir ../migration-007-seed-templates.sql

select test_assert(tn_link_identity('https://EXAMPLE.org:443/a?x=1#fragment') = array['example.org','https://example.org/a?x=1'],'host, default port and fragment normalize');
select test_assert(tn_link_identity('http://example.org/a?x=1') = array['example.org','http://example.org/a?x=1'],'scheme and query remain distinct');
select test_assert(tn_link_identity('https://user:pass@example.org') is null and tn_link_identity('https://example.invalid/demo') is null,'ambiguous and fixture identity unavailable');
select test_assert((select count(*)=1 from tn_sites),'duplicate source hosts create one site');
select test_assert(not exists(select 1 from tn_sources where kind='file' and site_id is not null),'files do not inherit storage host');
select test_assert(not has_table_privilege('authenticated','tn_pack_versions','INSERT') and not has_table_privilege('authenticated','tn_pack_versions','UPDATE'),'snapshots have no direct write grants');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select tn_create_pack('Seed draft','','Secret > Research','{}',false,
  '[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","note":"Member"}]');
do $$ declare p tn_packs; first_id uuid; again uuid; frozen jsonb; begin
  select * into p from tn_packs where title='Seed draft';
  perform test_assert(p.category_id is not null,'nested category mapped');
  first_id := tn_capture_pack_version(p.id,p.revision,'ordered-seeds-v1',
    '[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","rationale":"Primary specification"}]');
  again := tn_capture_pack_version(p.id,p.revision,'ordered-seeds-v1',
    '[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","rationale":"Primary specification"}]');
  perform test_assert(first_id=again,'retry returns same immutable snapshot');
  select snapshot into frozen from tn_pack_versions where id=first_id;
  perform test_assert(frozen->'entries'->0->>'site_host'='example.org','snapshot uses DB source/site identity');
  update tn_packs set title='Changed draft' where id=p.id;
  perform test_assert((select snapshot=frozen from tn_pack_versions where id=first_id),'editing pack preserves snapshot');
  begin
    perform tn_capture_pack_version(p.id,p.revision,'uniform-seeds-v1','[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","rationale":"Stale"}]');
    raise exception 'stale snapshot accepted';
  exception when sqlstate 'PT409' then null; end;
  select * into p from tn_packs where id=p.id;
  begin
    perform tn_capture_pack_version(p.id,p.revision,'uniform-seeds-v1','[{"source_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","rationale":"Not a member"}]');
    raise exception 'nonmember accepted';
  exception when sqlstate '22023' then null; end;
  perform test_assert((select count(*)=1 from tn_pack_versions),'invalid capture writes nothing');
end $$;
set role anon;
set request.jwt.claim.sub = '';
select test_assert(not exists(select 1 from tn_pack_versions),'private template versions hidden');
select test_assert(not exists(select 1 from tn_categories where path_key like 'secret%'),'private category and ancestors hidden');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update tn_packs set is_public=true where title='Changed draft';
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select test_assert((select count(*)=1 from tn_pack_versions),'other account reads public template');
select test_assert((select count(*)=2 from tn_categories where path_key like 'secret%'),'public pack exposes category ancestors');
do $$ declare p tn_packs; begin
  select * into p from tn_packs where title='Changed draft';
  begin
    perform tn_capture_pack_version(p.id,p.revision,'uniform-seeds-v1','[{"source_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","rationale":"Not my pack"}]');
    raise exception 'other owner captured version';
  exception when sqlstate 'PT404' then null; end;
end $$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update tn_packs set is_public=false where title='Changed draft';
set role anon;
set request.jwt.claim.sub = '';
select test_assert(not exists(select 1 from tn_pack_versions),'making pack private hides saved versions');
select test_assert(not exists(select 1 from tn_categories where path_key like 'secret%'),'category visibility follows pack');
reset role;
select 'Seed template identities, immutable snapshots, stale captures and privacy checks passed' as result;
