-- Empty disposable database only.
\ir template-merges.sql
\ir ../migration-015-template-discovery.sql
select pg_temp.assert_activation_preserved('015');
select test_assert(has_function_privilege('anon','tn_discover_templates(text,timestamptz,uuid,integer)','EXECUTE')
  and not (select prosecdef from pg_proc where oid='tn_discover_templates(text,timestamptz,uuid,integer)'::regprocedure),
  'discovery is a caller-RLS read, never a privileged aggregate');
