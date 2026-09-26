-- Empty disposable database only; retain all previous migration regression checks.
\ir template-forks.sql
\ir ../migration-014-template-merges.sql
select test_assert(not has_function_privilege('anon','tn_merge_templates(jsonb)','EXECUTE')
  and not has_table_privilege('authenticated','tn_template_merge_requests','SELECT')
  and not has_table_privilege('authenticated','tn_edge_origins','INSERT'), 'merge mutation, request and provenance grants remain restricted');
