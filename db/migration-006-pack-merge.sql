-- Run after 005. Multiple immutable parent rows retain the same per-parent RLS.
begin;
alter table public.tn_pack_origins drop constraint tn_pack_origins_pkey;
alter table public.tn_pack_origins add primary key (pack_id, parent_id);

create function public.tn_merge_pack(
  p_parents jsonb,
  p_title text, p_description text, p_category text, p_tags text[],
  p_is_public boolean, p_entries jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid(); child_id uuid; parent_row record;
  visible_count integer := 0; stale boolean := false;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_parents) is distinct from 'array' then
    raise exception 'Choose two parents' using errcode = '22023';
  end if;
  if jsonb_array_length(p_parents) <> 2 or exists (
    select 1 from jsonb_array_elements(p_parents) e where
      jsonb_typeof(e->'id') is distinct from 'string' or
      jsonb_typeof(e->'revision') is distinct from 'number' or
      (e->>'revision')::numeric not between 1 and 2147483647 or
      (e->>'revision')::numeric <> trunc((e->>'revision')::numeric)
  ) then raise exception 'Choose two versioned parents' using errcode = '22023'; end if;
  if (p_parents->0->>'id')::uuid = (p_parents->1->>'id')::uuid then
    raise exception 'Choose distinct parents' using errcode = '22023';
  end if;
  -- Stable lock order prevents opposite-order merges deadlocking. A share lock
  -- protects privacy, revision and deletion until both origins and the child commit.
  for parent_row in select p.id,p.revision from public.tn_packs p
    where p.id in (select (e->>'id')::uuid from jsonb_array_elements(p_parents) e)
      and (p.is_public or p.owner_id = caller_id)
    order by p.id for share
  loop
    visible_count := visible_count + 1;
    if not exists (select 1 from jsonb_array_elements(p_parents) e
      where (e->>'id')::uuid = parent_row.id and (e->>'revision')::integer = parent_row.revision)
    then stale := true; end if;
  end loop;
  if visible_count <> 2 then raise exception 'Parent unavailable' using errcode = 'PT404'; end if;
  if stale then raise exception 'Parent changed' using errcode = 'PT409'; end if;
  -- Reuse the constrained fork path for link validation and atomic child creation.
  child_id := public.tn_fork_pack((p_parents->0->>'id')::uuid,(p_parents->0->>'revision')::integer,
    p_title,p_description,p_category,p_tags,p_is_public,p_entries);
  insert into public.tn_pack_origins(pack_id,parent_id,parent_revision)
    values(child_id,(p_parents->1->>'id')::uuid,(p_parents->1->>'revision')::integer);
  return child_id;
end $$;
revoke all on function public.tn_merge_pack(jsonb,text,text,text,text[],boolean,jsonb) from public, anon;
grant execute on function public.tn_merge_pack(jsonb,text,text,text,text[],boolean,jsonb) to authenticated;
commit;
