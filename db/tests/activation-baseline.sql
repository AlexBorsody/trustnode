-- Disposable 011 baseline. Retain real-shaped data across every staged migration.
\ir evidence-relationships.sql
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ declare a uuid; b uuid; pack uuid; version uuid; edge jsonb; begin
  a := (tn_save_source(null,'{"kind":"link","title":"Retained seed","url":"https://upgrade-seed.example/a","excerpt":"Synthetic seed"}',null)->>'id')::uuid;
  b := (tn_save_source(null,'{"kind":"link","title":"Retained member","url":"https://upgrade-member.example/b","excerpt":"Synthetic member"}',null)->>'id')::uuid;
  pack := tn_create_pack('Retained 011 pack','Upgrade rehearsal','Activation > Retained','{fixture}',false,
    jsonb_build_array(jsonb_build_object('source_id',a,'note','Keep first'),jsonb_build_object('source_id',b,'note','Keep second')));
  version := tn_capture_pack_version(pack,(select revision from tn_packs where id=pack),'ordered-seeds-v1',
    jsonb_build_array(jsonb_build_object('source_id',a,'rationale','Retained explicit seed')));
  edge := tn_save_relationship(version,null,null,jsonb_build_object('source_id',a,'target_id',b,'relation','cites',
    'rationale','Retain authored evidence','source_locator','Section 1','source_quote','Synthetic A cites B','observed_on','2026-09-25'));
  perform tn_review_relationship((edge->>'revision_id')::uuid,'accept','Retained review',null,true,'','',null);
  perform tn_review_relationship((edge->>'revision_id')::uuid,'challenge','Retained unresolved challenge',null,false,'Section 2','Synthetic qualification',null);
end $$;
reset role;
create temporary table activation_before(table_name text primary key, rows_json jsonb not null);
-- Only new additive metadata is excluded. Every pre-012 field, row, order, hash,
-- author and timestamp must remain identical, including existing fixture files.
create function pg_temp.activation_rows(table_name text) returns jsonb language plpgsql as $$
declare result jsonb; begin
  execute format('select coalesce(jsonb_agg(j order by j::text),''[]''::jsonb) from
    (select to_jsonb(t)-array[''evidence_revision'',''trust_visibility_epoch'',''creation_kind''] as j from public.%I t) s',table_name) into result;
  return result;
end $$;
insert into activation_before
select name,pg_temp.activation_rows(name) from unnest(array['tn_sources','tn_sites','tn_categories','tn_tags','tn_source_tags',
  'tn_packs','tn_pack_sources','tn_pack_versions','tn_source_edges','tn_edge_revisions','tn_edge_reviews']) name;
create function pg_temp.assert_activation_preserved(stage text) returns text language plpgsql as $$
declare before_row record; begin
  for before_row in select * from activation_before loop
    perform test_assert(pg_temp.activation_rows(before_row.table_name)=before_row.rows_json,
      stage||' preserves 011 data in '||before_row.table_name);
  end loop;
  return stage||': retained sources, packs, versions and reviewed/challenged evidence unchanged';
end $$;
