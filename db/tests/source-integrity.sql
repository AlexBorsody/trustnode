-- Empty disposable database only; extend the existing pack/template checks.
\ir seed-templates.sql
alter table public.tn_sources alter column id set default gen_random_uuid();
alter table public.tn_sources add column owner_id uuid references auth.users(id),
  add column excerpt text, add column extracted_text text, add column extract_error text,
  add column file_path text, add column file_name text, add column mime_type text,
  add column category_id uuid references public.tn_categories(id);
update public.tn_sources set url=url || '?source=' || id::text where kind='link';
grant insert,update,delete on public.tn_sources to authenticated;
create policy "auth insert" on public.tn_sources for insert to authenticated with check(owner_id=auth.uid());
create policy "owner update" on public.tn_sources for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create table public.tn_tags(id uuid primary key default gen_random_uuid(),slug text unique not null,label text not null);
create table public.tn_source_tags(source_id uuid references public.tn_sources(id),tag_id uuid references public.tn_tags(id),primary key(source_id,tag_id));
alter table public.tn_tags enable row level security;
alter table public.tn_source_tags enable row level security;
grant all on public.tn_tags,public.tn_source_tags to authenticated;
grant select on public.tn_tags,public.tn_source_tags to anon;
create policy "public read" on public.tn_tags for select using(true);
create policy "auth insert" on public.tn_tags for insert to authenticated with check(true);
create policy "auth update" on public.tn_tags for update to authenticated using(true);
create policy "public read" on public.tn_source_tags for select using(true);
create policy "auth insert" on public.tn_source_tags for insert to authenticated with check(true);
create policy "owner delete" on public.tn_source_tags for delete using(exists(select 1 from public.tn_sources s where s.id=source_id and s.owner_id=auth.uid()));
create schema storage;
create table storage.buckets(id text primary key,file_size_limit bigint,allowed_mime_types text[]);
insert into storage.buckets(id) values('source-files');
create table storage.objects(name text,bucket_id text);
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant insert on storage.objects to authenticated;
create policy "auth upload files" on storage.objects for insert with check(bucket_id='source-files');
insert into public.tn_categories(slug,name,path,path_key) values('general','General','General','general');
\ir ../migration-009-source-integrity.sql

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ declare saved jsonb; target_id uuid; begin
  saved := tn_save_source(null,'{"kind":"link","title":"Primary","url":"https://example.org/atomic","excerpt":"Original description"}',
    '[{"slug":"oauth","label":"OAuth"}]');
  target_id := (saved->>'id')::uuid;
  perform test_assert(saved->>'status'='ready','source status derives from saved text');
  perform test_assert((select count(*)=1 from tn_source_tags st where st.source_id=target_id),'create includes tags');
  begin
    perform tn_save_source(target_id,'{"title":"Partial update"}','[{"slug":"invalid tag","label":"Broken"}]');
    raise exception 'invalid tag saved';
  exception when invalid_parameter_value then null; end;
  perform test_assert((select title='Primary' from tn_sources s where s.id=target_id),'failed tag save preserves source');
  perform tn_save_source(target_id,'{"title":"Updated"}','[{"slug":"oauth","label":"Hijacked shared label"},{"slug":"protocol","label":"Protocol"}]');
  perform test_assert((select label='OAuth' from tn_tags where slug='oauth'),'shared labels are not overwritten');
  perform test_assert((select count(*)=2 from tn_source_tags st where st.source_id=target_id),'tag replacement saved');
  perform tn_save_source(target_id,'{"excerpt":""}',null);
  perform test_assert((select status='pending' from tn_sources s where s.id=target_id),'clearing last text changes status in same transaction');
  begin
    perform tn_save_source(null,'{"kind":"link","title":"Duplicate","url":"https://example.org/atomic"}','[]');
    raise exception 'duplicate link accepted';
  exception when unique_violation then null; end;
  begin
    update tn_sources set owner_id='22222222-2222-4222-8222-222222222222' where tn_sources.id=target_id;
    raise exception 'source ownership overwritten';
  exception when insufficient_privilege then null; end;
end $$;
insert into storage.objects(name,bucket_id) values('11111111-1111-4111-8111-111111111111/file.txt','source-files');
do $$ begin
  begin
    insert into storage.objects(name,bucket_id) values('22222222-2222-4222-8222-222222222222/file.txt','source-files');
    raise exception 'foreign folder upload accepted';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$ declare target_id uuid; begin
  select s.id into target_id from tn_sources s where url='https://example.org/atomic';
  begin
    perform tn_save_source(target_id,'{"title":"Other owner"}','[]');
    raise exception 'other owner update accepted';
  exception when sqlstate 'PT404' then null; end;
  begin
    insert into tn_source_tags(source_id,tag_id) select target_id,t.id from tn_tags t where slug='protocol' on conflict do nothing;
    raise exception 'foreign source tag insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    update tn_tags set label='Hijacked' where slug='oauth';
    raise exception 'global tag update accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select test_assert(not has_function_privilege('anon','public.tn_save_source(uuid,jsonb,jsonb)','EXECUTE'),'anonymous save denied');
select test_assert((select file_size_limit=4194304 and not ('text/html'=any(allowed_mime_types)) from storage.buckets where id='source-files'),'bucket enforces upload limits');
select 'Atomic source saves, immutable attribution/tags and upload ownership passed' as result;

\ir ../migration-010-source-write-invariants.sql
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$ declare path text; mime text; saved jsonb; bad_url text; begin
  -- A caller cannot bypass RPC validation through PostgREST table INSERT.
  for path,mime in select * from (values
    ('22222222-2222-4222-8222-222222222222/file.txt','text/plain'),
    ('11111111-1111-4111-8111-111111111111/file.html','text/html'),
    ('11111111-1111-4111-8111-111111111111/../file.txt','text/plain'),
    (null,'text/plain'),
    ('11111111-1111-4111-8111-111111111111/file.txt',null)
  ) as invalid(path,mime) loop
    begin
      insert into tn_sources(owner_id,kind,title,file_path,file_name,mime_type,status)
      values(auth.uid(),'file','Forged source',path,'file.txt',mime,'ready');
      raise exception 'invalid direct file INSERT accepted';
    exception when check_violation then null; end;
  end loop;
  foreach bad_url in array array[null,'javascript:alert(1)','https://','https://user:pass@example.org','https://example.org/space here'] loop
    begin
      insert into tn_sources(owner_id,kind,title,url) values(auth.uid(),'link','Invalid link',bad_url);
      raise exception 'invalid direct link INSERT accepted';
    exception when check_violation then null; end;
  end loop;
  saved := tn_save_source(null,
    '{"kind":"file","title":"Owned file","file_path":"11111111-1111-4111-8111-111111111111/file.txt","file_name":"file.txt","mime_type":"text/plain","extracted_text":"Evidence"}',
    '[{"slug":"protocol","label":"Protocol"}]');
  perform test_assert(saved->>'status'='ready','legitimate file RPC still works');
  perform tn_save_source((saved->>'id')::uuid,'{"title":"Edited owned file"}',null);
  saved := tn_save_source(null,'{"kind":"link","title":"Valid link","url":"https://example.org/direct-check?x=1#evidence","excerpt":"Evidence"}',null);
  perform test_assert(saved->>'status'='ready','legitimate link RPC still works');
  insert into tn_sources(owner_id,kind,title,url) values(auth.uid(),'link','Direct link','https://example.org/valid-direct');
end $$;
reset role;
-- Retain file provenance when its account is deleted (the real FK uses SET NULL).
update tn_sources set owner_id=null where title='Edited owned file';
select 'Direct source identity invariants and legitimate RPC saves passed' as result;
