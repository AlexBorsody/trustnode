-- Run after 008. Atomic source metadata/tag saves and caller-scoped storage.
begin;

-- Shared attribution and file identity cannot be rewritten by a source editor.
revoke update on public.tn_sources from anon, authenticated;
grant update(title,excerpt,category_id,status) on public.tn_sources to authenticated;
alter table public.tn_sources add constraint tn_source_text_bounds check (
  length(btrim(title)) between 1 and 300 and coalesce(length(excerpt),0) <= 4000
  and coalesce(length(extracted_text),0) <= 204800
  and coalesce(length(extract_error),0) <= 500
  and coalesce(length(url),0) <= 2048
) not valid;
create unique index tn_sources_link_url_unique on public.tn_sources(url) where kind = 'link';

drop policy "auth update" on public.tn_tags;
revoke update, delete on public.tn_tags from public, anon, authenticated;
alter table public.tn_tags add constraint tn_tag_text_bounds check (
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60
  and length(btrim(label)) between 1 and 120
) not valid;
drop policy "auth insert" on public.tn_source_tags;
create policy "attach own source tags" on public.tn_source_tags for insert to authenticated
  with check (exists(select 1 from public.tn_sources s where s.id=source_id and s.owner_id=auth.uid()));
revoke update on public.tn_source_tags from public, anon, authenticated;

-- Public files remain public; writes are limited to the signed-in user's folder.
drop policy "auth upload files" on storage.objects;
create policy "auth upload files" on storage.objects for insert to authenticated
  with check (bucket_id='source-files' and (storage.foldername(name))[1]=auth.uid()::text);
update storage.buckets set file_size_limit=4194304,
  allowed_mime_types=array['application/pdf','text/plain','text/markdown','text/csv','application/json']
  where id='source-files';

create function public.tn_save_source(p_id uuid, p_data jsonb, p_tags jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
<<source_save>>
declare
  caller uuid := auth.uid(); row public.tn_sources; category_id uuid;
  tag jsonb; tag_id uuid; source_id uuid; state text; key text;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Expected source details' using errcode='22023';
  end if;
  for key in select jsonb_object_keys(p_data) loop
    if key not in ('kind','title','url','file_path','file_name','mime_type','excerpt','extracted_text','extract_error','category')
      or (p_id is not null and key not in ('title','excerpt','category'))
      or jsonb_typeof(p_data->key) not in ('string','null') then
      raise exception 'Invalid source field' using errcode='22023';
    end if;
  end loop;
  if p_tags is not null then
    if jsonb_typeof(p_tags) is distinct from 'array' then
      raise exception 'Expected tags' using errcode='22023';
    end if;
    if jsonb_array_length(p_tags)>10 or exists(select 1 from jsonb_array_elements(p_tags) t
      where jsonb_typeof(t) is distinct from 'object'
        or jsonb_typeof(t->'slug') is distinct from 'string'
        or jsonb_typeof(t->'label') is distinct from 'string'
        or (t->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        or length(t->>'slug') not between 1 and 60
        or length(btrim(t->>'label')) not between 1 and 120)
      or (select count(distinct t->>'slug') from jsonb_array_elements(p_tags) t)<>jsonb_array_length(p_tags)
    then raise exception 'Invalid tags' using errcode='22023'; end if;
  end if;

  if p_id is not null then
    select * into row from public.tn_sources where id=p_id and owner_id=caller for update;
    if not found then raise exception 'Source unavailable' using errcode='PT404'; end if;
    category_id := row.category_id;
  end if;
  if p_id is null or p_data ? 'category' then
    select c.id into category_id from public.tn_categories c
      where c.slug=coalesce(p_data->>'category','general') and c.owner_id is null;
    if not found then raise exception 'Unknown public category' using errcode='22023'; end if;
  end if;
  if p_id is null then
    if p_data->>'kind' is null or p_data->>'kind' not in ('link','file') then
      raise exception 'Invalid source kind' using errcode='22023';
    end if;
    if p_data->>'kind'='link' and coalesce(p_data->>'url','') !~ '^https?://' then
      raise exception 'Expected web URL' using errcode='22023';
    end if;
    if p_data->>'kind'='file' and (
      split_part(coalesce(p_data->>'file_path',''),'/',1)<>caller::text
      or coalesce(p_data->>'mime_type','') not in ('application/pdf','text/plain','text/markdown','text/csv','application/json')) then
      raise exception 'Invalid file identity' using errcode='22023';
    end if;
    state := case when nullif(p_data->>'extract_error','') is not null and nullif(btrim(p_data->>'excerpt'),'') is null then 'failed'
      when nullif(btrim(p_data->>'excerpt'),'') is not null or nullif(p_data->>'extracted_text','') is not null then 'ready' else 'pending' end;
    insert into public.tn_sources(owner_id,kind,title,url,file_path,file_name,mime_type,category_id,status,excerpt,extracted_text,extract_error)
      values(caller,p_data->>'kind',btrim(p_data->>'title'),
        case when p_data->>'kind'='link' then p_data->>'url' end,
        case when p_data->>'kind'='file' then p_data->>'file_path' end,
        case when p_data->>'kind'='file' then p_data->>'file_name' end,
        case when p_data->>'kind'='file' then p_data->>'mime_type' end,
        category_id,state,nullif(btrim(p_data->>'excerpt'),''),p_data->>'extracted_text',p_data->>'extract_error')
      returning id into source_id;
  else
    if p_data ? 'title' then row.title := btrim(p_data->>'title'); end if;
    if p_data ? 'excerpt' then row.excerpt := nullif(btrim(p_data->>'excerpt'),''); end if;
    state := case when nullif(row.excerpt,'') is not null or nullif(row.extracted_text,'') is not null then 'ready'
      when nullif(row.extract_error,'') is not null then 'failed' else 'pending' end;
    update public.tn_sources set title=row.title, excerpt=row.excerpt,
      category_id=source_save.category_id, status=state where id=p_id;
    source_id := p_id;
  end if;
  if p_tags is not null then
    delete from public.tn_source_tags st where st.source_id=source_save.source_id;
    for tag in select t from jsonb_array_elements(p_tags) t order by t->>'slug' loop
      insert into public.tn_tags(slug,label) values(tag->>'slug',btrim(tag->>'label')) on conflict(slug) do nothing;
      select t.id into tag_id from public.tn_tags t where t.slug=tag->>'slug';
      insert into public.tn_source_tags(source_id,tag_id) values(source_id,tag_id);
    end loop;
  end if;
  return jsonb_build_object('id',source_id,'status',state);
end $$;
revoke all on function public.tn_save_source(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.tn_save_source(uuid,jsonb,jsonb) to authenticated;
commit;
