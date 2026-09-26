-- Empty disposable database only.
\ir trust-runs.sql
\ir ../migration-013-template-forks.sql
select pg_temp.assert_activation_preserved('013');
select test_assert(not has_function_privilege('anon','tn_fork_template(uuid,text,bigint,bigint,boolean,text,uuid)','EXECUTE')
  and not has_table_privilege('authenticated','tn_template_origins','INSERT')
  and not has_table_privilege('authenticated','tn_edge_origins','UPDATE')
  and not has_table_privilege('authenticated','tn_template_fork_requests','SELECT'), 'fork provenance/request grants remain narrow');
