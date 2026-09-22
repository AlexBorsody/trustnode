-- Empty disposable database only; do not run against production.
\ir evidence-relationships.sql
\ir ../migration-012-trust-runs.sql
select test_assert(not has_function_privilege('authenticated','tn_complete_trust_job(uuid,uuid,text,jsonb,text,text)','EXECUTE')
  and not has_function_privilege('anon','tn_enqueue_trust_run(uuid,integer,bigint,uuid)','EXECUTE'),'caller cannot execute worker operations');
select test_assert(not has_table_privilege('tn_graph_worker','tn_trust_runs','UPDATE')
  and not has_table_privilege('tn_graph_worker','tn_graph_snapshots','SELECT')
  and not has_function_privilege('tn_graph_worker','tn_enqueue_trust_run(uuid,integer,bigint,uuid)','EXECUTE'),'worker can access only lease-scoped functions');
select test_assert(not has_column_privilege('authenticated','tn_pack_versions','evidence_revision','UPDATE')
  and not has_column_privilege('authenticated','tn_packs','trust_visibility_epoch','UPDATE'),'caller cannot forge graph or visibility revisions');
select 'Trust-run schema and role boundaries passed' as result;
