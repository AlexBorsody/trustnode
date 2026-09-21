-- Run after migration-003. Adds owner editing/deletion without changing sources.
begin;
alter table public.tn_packs
  add column revision integer not null default 1 check (revision > 0),
  add column updated_at timestamptz not null default now();

create policy "edit own packs" on public.tn_packs for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own packs" on public.tn_packs for delete to authenticated
  using (owner_id = auth.uid());
create policy "remove own pack sources" on public.tn_pack_sources for delete to authenticated
  using (exists (select 1 from public.tn_packs p where p.id = pack_id and p.owner_id = auth.uid()));
-- Identity, ownership, creation time and revision are not caller-editable.
-- Supabase default grants may already include table-level UPDATE.
revoke update on public.tn_packs from anon, authenticated;
grant update(title,description,category,tags,is_public) on public.tn_packs to authenticated;
grant delete on public.tn_packs, public.tn_pack_sources to authenticated;

create function public.tn_pack_revision() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger tn_pack_revision before update on public.tn_packs
  for each row execute function public.tn_pack_revision();

-- Direct entry writes must invalidate old drafts too. Cascaded deletes after a
-- parent is removed update zero rows. Revision is an opaque concurrency token.
create function public.tn_pack_entry_revision() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  update public.tn_packs set title = title
    where id = case when tg_op = 'DELETE' then old.pack_id else new.pack_id end;
  return null;
end $$;
create trigger tn_pack_entry_revision after insert or delete on public.tn_pack_sources
  for each row execute function public.tn_pack_entry_revision();

create function public.tn_update_pack(
  p_id uuid, p_revision integer, p_title text, p_description text, p_category text,
  p_tags text[], p_is_public boolean, p_entries jsonb
) returns integer language plpgsql security invoker set search_path = public as $$
declare current_revision integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select revision into current_revision from public.tn_packs
    where id = p_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Pack not found' using errcode = 'PT404'; end if;
  if p_revision is distinct from current_revision then
    raise exception 'Pack changed; reload before saving' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Entries must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_entries) not between 1 and 50 then raise exception 'Choose 1 to 50 sources' using errcode = '22023'; end if;
  if exists (select 1 from unnest(p_tags) t where t is null or length(btrim(t)) not between 1 and 40) then
    raise exception 'Invalid tags' using errcode = '22023';
  end if;
  update public.tn_packs set title = p_title, description = p_description,
    category = p_category, tags = p_tags, is_public = p_is_public where id = p_id;
  delete from public.tn_pack_sources where pack_id = p_id;
  insert into public.tn_pack_sources(pack_id,source_id,rank,note)
    select p_id, (entry->>'source_id')::uuid, position::integer, coalesce(entry->>'note','')
    from jsonb_array_elements(p_entries) with ordinality as items(entry,position);
  select revision into current_revision from public.tn_packs where id = p_id;
  return current_revision;
end $$;

create function public.tn_delete_pack(p_id uuid, p_revision integer)
returns uuid language plpgsql security invoker set search_path = public as $$
declare current_revision integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select revision into current_revision from public.tn_packs
    where id = p_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Pack not found' using errcode = 'PT404'; end if;
  if p_revision is distinct from current_revision then
    raise exception 'Pack changed; reload before deleting' using errcode = 'PT409';
  end if;
  delete from public.tn_packs where id = p_id;
  return p_id;
end $$;
revoke all on function public.tn_update_pack(uuid,integer,text,text,text,text[],boolean,jsonb) from public;
revoke all on function public.tn_delete_pack(uuid,integer) from public;
grant execute on function public.tn_update_pack(uuid,integer,text,text,text,text[],boolean,jsonb) to authenticated;
grant execute on function public.tn_delete_pack(uuid,integer) to authenticated;
commit;
