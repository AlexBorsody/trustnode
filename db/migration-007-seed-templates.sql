-- Run after 006. Source identities and immutable, explicitly seeded templates.
begin;

create table public.tn_sites (
  id uuid primary key default gen_random_uuid(),
  host text unique not null,
  created_at timestamptz not null default now()
);
alter table public.tn_sites enable row level security;
revoke all on public.tn_sites from public, anon, authenticated;
grant select on public.tn_sites to anon, authenticated;
create policy "read site identities" on public.tn_sites for select using (true);

-- Existing link contribution already serializes URLs through the WHATWG parser
-- (including IDNA). Do not guess the identity of unsupported legacy/direct URLs.
create function public.tn_link_identity(value text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare parts text[]; hostname text; port text; suffix text; scheme text;
begin
  if value is null or value ~ '[[:space:]\\]' then return null; end if;
  parts := regexp_match(value, '^(https?)://([A-Za-z0-9.-]+)(:[0-9]{1,5})?([/?#].*)?$', 'i');
  if parts is null then return null; end if;
  scheme := lower(parts[1]); hostname := lower(parts[2]); port := coalesce(parts[3], '');
  if length(hostname) > 253 or hostname !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    or hostname = 'invalid' or hostname like '%.invalid' then return null; end if;
  if port <> '' then
    if substring(port from 2)::integer not between 1 and 65535 then return null; end if;
    port := ':' || substring(port from 2)::integer::text;
  end if;
  if (scheme = 'https' and port = ':443') or (scheme = 'http' and port = ':80') then port := ''; end if;
  suffix := split_part(coalesce(parts[4], ''), '#', 1);
  if suffix = '' or left(suffix, 1) = '?' then suffix := '/' || suffix; end if;
  return array[hostname, scheme || '://' || hostname || port || suffix];
end $$;

alter table public.tn_sources add column site_id uuid references public.tn_sites(id),
  add column normalized_url text;
create function public.tn_assign_source_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare identity text[];
begin
  new.site_id := null; new.normalized_url := null;
  if new.kind = 'link' then identity := public.tn_link_identity(new.url); end if;
  if identity is not null then
    insert into public.tn_sites(host) values(identity[1]) on conflict(host) do nothing;
    select id into new.site_id from public.tn_sites where host = identity[1];
    new.normalized_url := identity[2];
  end if;
  return new;
end $$;
revoke all on function public.tn_assign_source_identity() from public, anon, authenticated;
create trigger tn_source_identity before insert or update on public.tn_sources
  for each row execute function public.tn_assign_source_identity();
update public.tn_sources set url = url;

-- New category paths are curator-scoped. A private pack must not publish its
-- topic through the otherwise-public category dictionary.
alter table public.tn_categories
  add column parent_id uuid references public.tn_categories(id),
  add column owner_id uuid references auth.users(id) on delete cascade,
  add column path text,
  add column path_key text;
update public.tn_categories set path = name, path_key = lower(btrim(name));
alter table public.tn_categories alter column path set not null,
  alter column path_key set not null;
create unique index tn_category_owner_path on public.tn_categories(owner_id,path_key) where owner_id is not null;
create unique index tn_category_public_path on public.tn_categories(path_key) where owner_id is null;
alter table public.tn_packs add column category_id uuid references public.tn_categories(id),
  add column category_key text;

create function public.tn_category_path(value text) returns text
language sql immutable set search_path = '' as $$
  select case when bool_and(length(btrim(part)) > 0)
    then string_agg(regexp_replace(btrim(part), '[[:space:]]+', ' ', 'g'), ' > ' order by n)
    else null end from unnest(string_to_array(value, '>')) with ordinality as t(part,n)
$$;

create function public.tn_assign_pack_category() returns trigger
language plpgsql security definer set search_path = '' as $$
declare label text; segment text; current_path text := ''; parent uuid := null; resolved uuid;
begin
  label := public.tn_category_path(new.category);
  new.category_id := null; new.category_key := lower(label);
  -- Keep malformed legacy labels readable; version capture requests correction.
  if label is null then return new; end if;
  foreach segment in array string_to_array(label, ' > ') loop
    current_path := case when current_path = '' then segment else current_path || ' > ' || segment end;
    select id into resolved from public.tn_categories
      where path_key = lower(current_path) and owner_id is null;
    if resolved is null then
      insert into public.tn_categories(slug,name,parent_id,owner_id,path,path_key)
        values('topic-' || gen_random_uuid()::text,segment,parent,new.owner_id,current_path,lower(current_path))
        on conflict(owner_id,path_key) where owner_id is not null do nothing;
      select id into resolved from public.tn_categories
        where owner_id = new.owner_id and path_key = lower(current_path);
    end if;
    parent := resolved;
  end loop;
  new.category_id := parent;
  return new;
end $$;
revoke all on function public.tn_assign_pack_category() from public, anon, authenticated;
create trigger tn_pack_category before insert or update on public.tn_packs
  for each row execute function public.tn_assign_pack_category();
-- This deliberately advances existing pack revision tokens once during backfill.
update public.tn_packs set category = category;

drop policy "public read" on public.tn_categories;
drop policy "auth insert" on public.tn_categories;
revoke all on public.tn_categories from public, anon, authenticated;
grant select on public.tn_categories to anon, authenticated;
create policy "read visible categories" on public.tn_categories for select using (
  owner_id is null or owner_id = auth.uid() or exists (
    select 1 from public.tn_packs p where p.owner_id = tn_categories.owner_id
      and (p.category_key = tn_categories.path_key
        or starts_with(p.category_key, tn_categories.path_key || ' > '))
  )
);

create table public.tn_pack_versions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.tn_packs(id) on delete cascade,
  pack_revision integer not null,
  snapshot jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique(pack_id,content_hash)
);
create index tn_pack_versions_order on public.tn_pack_versions(pack_id,created_at desc,id);
alter table public.tn_pack_versions enable row level security;
revoke all on public.tn_pack_versions from public, anon, authenticated;
grant select on public.tn_pack_versions to anon, authenticated;
create policy "read visible template versions" on public.tn_pack_versions for select using (
  exists(select 1 from public.tn_packs p where p.id = pack_id)
);

-- The caller supplies seed choices only, never source/site identities or snapshots.
create function public.tn_capture_pack_version(p_id uuid, p_revision integer, p_mode text, p_seeds jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pack public.tn_packs; entries jsonb; body jsonb; fingerprint text; version_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into pack from public.tn_packs where id = p_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Pack unavailable' using errcode = 'PT404'; end if;
  if p_revision is distinct from pack.revision then raise exception 'Pack changed' using errcode = 'PT409'; end if;
  if p_mode is null or p_mode not in ('uniform-seeds-v1','ordered-seeds-v1')
    or jsonb_typeof(p_seeds) is distinct from 'array' then
    raise exception 'Choose seed weighting and seeds' using errcode = '22023';
  end if;
  if jsonb_array_length(p_seeds) not between 1 and 50 or exists (
    select 1 from jsonb_array_elements(p_seeds) e where jsonb_typeof(e) <> 'object'
      or jsonb_typeof(e->'source_id') is distinct from 'string'
      or jsonb_typeof(e->'rationale') is distinct from 'string'
      or length(btrim(e->>'rationale')) not between 1 and 1000
  ) then raise exception 'Choose 1 to 50 seeds with rationale' using errcode = '22023'; end if;
  if (select count(distinct (e->>'source_id')::uuid) from jsonb_array_elements(p_seeds) e) <> jsonb_array_length(p_seeds)
    then raise exception 'Duplicate seed' using errcode = '22023'; end if;
  if pack.category_id is null then raise exception 'Correct the category path before capturing' using errcode = '22023'; end if;
  -- Hold source identities/status steady between validation and snapshot assembly.
  perform s.id from public.tn_sources s join public.tn_pack_sources ps on ps.source_id = s.id
    where ps.pack_id = p_id order by s.id for share of s;
  if exists(select 1 from jsonb_array_elements(p_seeds) e where not exists (
    select 1 from public.tn_pack_sources ps join public.tn_sources s on s.id = ps.source_id
    where ps.pack_id = p_id and s.id = (e->>'source_id')::uuid
      and s.kind = 'link' and s.status = 'ready' and s.site_id is not null
  )) then raise exception 'Seeds must be ready identified links in this pack' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object(
    'source_id',s.id,'title',s.title,'url',s.url,'normalized_url',s.normalized_url,
    'site_id',s.site_id,'site_host',site.host,'status',s.status,'rank',ps.rank,'note',ps.note,
    'is_seed',seed.value is not null,'rationale',coalesce(btrim(seed.value->>'rationale'),'')) order by ps.rank)
  into entries from public.tn_pack_sources ps join public.tn_sources s on s.id = ps.source_id
    left join public.tn_sites site on site.id = s.site_id
    left join jsonb_array_elements(p_seeds) seed(value) on (seed.value->>'source_id')::uuid = s.id
    where ps.pack_id = p_id;
  body := jsonb_build_object('schema_version','seed-template-v1','policy_version','accepted-edges-v1',
    'title',pack.title,'description',pack.description,'category',pack.category,
    'category_id',pack.category_id,'category_key',pack.category_key,'tags',pack.tags,
    'owner_id',pack.owner_id,'pack_revision',pack.revision,'seed_mode',p_mode,'entries',entries);
  fingerprint := encode(sha256(convert_to(body::text,'UTF8')),'hex');
  insert into public.tn_pack_versions(pack_id,pack_revision,snapshot,content_hash)
    values(p_id,pack.revision,body,fingerprint) on conflict(pack_id,content_hash) do nothing;
  select id into version_id from public.tn_pack_versions where pack_id = p_id and content_hash = fingerprint;
  return version_id;
end $$;
revoke all on function public.tn_capture_pack_version(uuid,integer,text,jsonb) from public, anon;
grant execute on function public.tn_capture_pack_version(uuid,integer,text,jsonb) to authenticated;
commit;
