-- Disposable database only. Evidence mutations must preserve privacy/history.
\ir source-integrity.sql
\ir ../migration-011-evidence-relationships.sql
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ declare a uuid; b uuid; pack uuid; version uuid; begin
  a := (tn_save_source(null,'{"kind":"link","title":"Evidence A","url":"https://a.example.org/evidence","excerpt":"Fixture A"}',null)->>'id')::uuid;
  b := (tn_save_source(null,'{"kind":"link","title":"Evidence B","url":"https://b.example.org/evidence","excerpt":"Fixture B"}',null)->>'id')::uuid;
  pack := tn_create_pack('Evidence scope','','Research','{}',true,jsonb_build_array(jsonb_build_object('source_id',a,'note',''),jsonb_build_object('source_id',b,'note','')));
  version := tn_capture_pack_version(pack,(select revision from tn_packs where id=pack),'uniform-seeds-v1',jsonb_build_array(jsonb_build_object('source_id',a,'rationale','Fixture seed')));
end $$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ declare version tn_pack_versions; saved jsonb; body jsonb; begin
  select v.* into version from tn_pack_versions v join tn_packs p on p.id=v.pack_id where p.title='Evidence scope';
  body := jsonb_build_object('source_id',version.snapshot->'entries'->0->>'source_id','target_id',version.snapshot->'entries'->1->>'source_id',
    'relation','cites','rationale','Fixture citation','source_locator','Section 2','source_quote','Fixture A cites Fixture B.','observed_on','2026-09-21');
  saved := tn_save_relationship(version.id,null,null,body);
  perform test_assert(saved->>'revision'='1','public proposal created');
  begin
    perform tn_review_relationship((saved->>'revision_id')::uuid,'accept','I own this proposal',null,true,'','',null);
    raise exception 'non-curator accepted own evidence';
  exception when sqlstate 'PT404' then null; end;
  begin
    perform tn_save_relationship(version.id,null,null,body||'{"source_id":"00000000-0000-4000-8000-000000000000"}');
    raise exception 'out-of-template source accepted';
  exception when invalid_parameter_value then null; end;
end $$;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ declare r tn_edge_revisions; decision jsonb; begin
  select * into r from tn_edge_revisions;
  begin
    perform tn_review_relationship(r.id,'accept','Unreviewed',null,false,'','',null);
    raise exception 'unreviewed acceptance allowed';
  exception when invalid_parameter_value then null; end;
  decision := tn_review_relationship(r.id,'accept','Reviewed fixture evidence',null,true,'','',null);
  begin
    perform tn_review_relationship(r.id,'withdraw','Stale decision',null,false,'','',null);
    raise exception 'stale decision accepted';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform tn_save_relationship((select template_version_id from tn_source_edges),r.edge_id,r.id,r.body-'origin'-'source_url'-'target_url'-'source_site_id'-'target_site_id');
    raise exception 'curator rewrote another author proposal';
  exception when sqlstate 'PT404' then null; end;
end $$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ declare r tn_edge_revisions; challenge jsonb; revised jsonb; version uuid; body jsonb; begin
  select * into r from tn_edge_revisions;
  select template_version_id into version from tn_source_edges;
  challenge := tn_review_relationship(r.id,'challenge','Citation is disputed',null,false,'Section 3','Fixture qualifying text',null);
  perform test_assert(tn_list_relationships(version)->0->'current_decision'->>'action'='accept','challenge does not silently change acceptance');
  body := (r.body-'origin'-'source_url'-'target_url'-'source_site_id'-'target_site_id')||'{"rationale":"Corrected citation scope"}';
  revised := tn_save_relationship(version,r.edge_id,r.id,body);
  perform test_assert((select count(*)=2 from tn_edge_revisions),'revisions append without erasing evidence');
  perform test_assert(tn_list_relationships(version)->0->'current_decision'='null'::jsonb,'acceptance does not carry to edited evidence');
  begin
    perform tn_save_relationship(version,r.edge_id,r.id,body);
    raise exception 'stale evidence revision accepted';
  exception when sqlstate 'PT409' then null; end;
end $$;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ declare c tn_edge_reviews; begin
  select * into c from tn_edge_reviews where action='challenge';
  perform tn_review_relationship(c.revision_id,'uphold','Addressed by revised evidence',null,false,'','',c.id);
  begin
    perform tn_review_relationship(c.revision_id,'dismiss','Conflicting second resolution',null,false,'','',c.id);
    raise exception 'resolved challenge rewritten';
  exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
select test_assert(not has_table_privilege('authenticated','tn_edge_revisions','INSERT')
  and not has_table_privilege('authenticated','tn_edge_reviews','UPDATE'),'history has no direct mutation grants');
select test_assert(not has_function_privilege('anon','tn_save_relationship(uuid,uuid,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','tn_evidence_template(uuid,boolean)','EXECUTE'),'mutation/internal helper privileges');
set role anon;
set request.jwt.claim.sub='';
select test_assert((select count(*)=2 from tn_edge_revisions),'public evidence is readable');
reset role;
update tn_packs set is_public=false where title='Evidence scope';
set role anon;
select test_assert((select count(*)=0 from tn_source_edges) and (select count(*)=0 from tn_edge_revisions)
  and (select count(*)=0 from tn_edge_reviews),'hidden template hides every evidence layer');
reset role;
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select test_assert((select count(*)=0 from tn_source_edges),'proposal author cannot reveal a now-private template');
reset role;
delete from tn_packs where title='Evidence scope';
select test_assert((select count(*)=0 from tn_edge_revisions) and (select count(*)=0 from tn_edge_reviews),'template deletion cascades through immutable histories');
select 'Evidence revisions, decisions, challenges and template privacy passed' as result;
