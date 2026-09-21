-- Run after 004. Attribution never grants access to a parent or couples its copies.
begin;
create table public.tn_pack_origins (
  pack_id uuid primary key references public.tn_packs(id) on delete cascade,
  parent_id uuid not null references public.tn_packs(id) on delete cascade,
  parent_revision integer not null check (parent_revision > 0),
  forked_at timestamptz not null default now(),
  check (pack_id <> parent_id)
);
create index tn_pack_origins_parent_idx on public.tn_pack_origins(parent_id);
alter table public.tn_pack_origins enable row level security;
-- Explicit revocation also overrides Supabase's default table grants.
revoke all on public.tn_pack_origins from public, anon, authenticated;
grant select on public.tn_pack_origins to anon, authenticated;
create policy "read mutually visible ancestry" on public.tn_pack_origins for select
  using (exists (select 1 from public.tn_packs p where p.id = pack_id)
     and exists (select 1 from public.tn_packs p where p.id = parent_id));

-- Definer privileges are limited to this transaction: lock a readable parent,
-- create a new caller-owned pack, and record its immutable origin. No parent writes.
-- Invoker FOR SHARE would require owner UPDATE RLS on another curator's pack.
create function public.tn_fork_pack(
  p_parent_id uuid, p_parent_revision integer,
  p_title text, p_description text, p_category text, p_tags text[],
  p_is_public boolean, p_entries jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare parent_revision integer; child_id uuid; caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select p.revision into parent_revision from public.tn_packs p
    where p.id = p_parent_id and (p.is_public or p.owner_id = caller_id) for share;
  if not found then raise exception 'Parent unavailable' using errcode = 'PT404'; end if;
  if p_parent_revision is distinct from parent_revision then
    raise exception 'Parent changed; reload before copying' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Entries must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 50 then
    raise exception 'Choose 1 to 50 sources' using errcode = '22023';
  end if;
  -- Definer execution bypasses entry INSERT RLS, so enforce its link-only rule here.
  if exists (select 1 from jsonb_array_elements(p_entries) e
    where not exists (select 1 from public.tn_sources s
      where s.id = (e->>'source_id')::uuid and s.kind = 'link')) then
    raise exception 'Choose existing link sources' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_tags) t where t is null or length(btrim(t)) not between 1 and 40) then
    raise exception 'Invalid tags' using errcode = '22023';
  end if;
  child_id := public.tn_create_pack(p_title,p_description,p_category,p_tags,p_is_public,p_entries);
  insert into public.tn_pack_origins(pack_id,parent_id,parent_revision)
    values(child_id,p_parent_id,parent_revision);
  return child_id;
end $$;
revoke all on function public.tn_fork_pack(uuid,integer,text,text,text,text[],boolean,jsonb) from public, anon;
grant execute on function public.tn_fork_pack(uuid,integer,text,text,text,text[],boolean,jsonb) to authenticated;
commit;
