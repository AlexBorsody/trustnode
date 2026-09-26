\ir template-discovery.sql
\ir ../migration-016-template-reference.sql
select test_assert(has_function_privilege('anon','tn_template_reference_scope(uuid,text)','EXECUTE')
  and not (select prosecdef from pg_proc where oid='tn_template_reference_scope(uuid,text)'::regprocedure),
  'reference comparison is a caller-RLS read');
