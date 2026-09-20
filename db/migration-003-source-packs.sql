-- Source packs v1. Run after migration-001. No service-role key required.
-- The MVP UI creates a copy to revise a pack. Rank is curator preference.
begin;
create table public.tn_packs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  category text not null check (length(btrim(category)) between 1 and 80),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.tn_pack_sources (
  pack_id uuid not null references public.tn_packs(id) on delete cascade,
  source_id uuid not null references public.tn_sources(id),
  rank integer not null check (rank between 1 and 50),
  note text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  primary key (pack_id, source_id),
  unique (pack_id, rank)
);
create index tn_packs_created_idx on public.tn_packs(created_at desc);
create index tn_packs_owner_idx on public.tn_packs(owner_id);
alter table public.tn_packs enable row level security;
alter table public.tn_pack_sources enable row level security;
create policy "read visible packs" on public.tn_packs for select
  using (is_public or owner_id = auth.uid());
create policy "create own packs" on public.tn_packs for insert to authenticated
  with check (owner_id = auth.uid());
create policy "read visible pack sources" on public.tn_pack_sources for select
  using (exists (select 1 from public.tn_packs p where p.id = pack_id));
create policy "add own pack sources" on public.tn_pack_sources for insert to authenticated
  with check (exists (select 1 from public.tn_packs p where p.id = pack_id and p.owner_id = auth.uid())
    and exists (select 1 from public.tn_sources s where s.id = source_id and s.kind = 'link'));
grant select on public.tn_packs, public.tn_pack_sources to anon, authenticated;
grant insert on public.tn_packs, public.tn_pack_sources to authenticated;

-- One transaction prevents empty/partially populated packs on failure.
-- SECURITY INVOKER keeps the caller's RLS and never bypasses source visibility.
create function public.tn_create_pack(
  p_title text, p_description text, p_category text, p_tags text[],
  p_is_public boolean, p_entries jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare pack_uuid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Entries must be an array'; end if;
  if jsonb_array_length(p_entries) not between 1 and 50 then raise exception 'Choose 1 to 50 sources'; end if;
  if exists (select 1 from unnest(p_tags) t where t is null or length(btrim(t)) not between 1 and 40) then
    raise exception 'Invalid tags';
  end if;
  insert into public.tn_packs(owner_id,title,description,category,tags,is_public)
    values(auth.uid(),p_title,p_description,p_category,p_tags,p_is_public) returning id into pack_uuid;
  insert into public.tn_pack_sources(pack_id,source_id,rank,note)
    select pack_uuid, (entry->>'source_id')::uuid, position::integer, coalesce(entry->>'note','')
    from jsonb_array_elements(p_entries) with ordinality as items(entry,position);
  return pack_uuid;
end $$;
revoke all on function public.tn_create_pack(text,text,text,text[],boolean,jsonb) from public;
grant execute on function public.tn_create_pack(text,text,text,text[],boolean,jsonb) to authenticated;
commit;
