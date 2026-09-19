-- TrustNode source commons: user-contributed sources, categories, tags.
-- Run once in the trustnode Supabase project's SQL editor.
-- Tables are prefixed tn_ to avoid collisions if the project is shared.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- categories
create table if not exists public.tn_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------- sources
create table if not exists public.tn_sources (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete set null,
  kind        text not null check (kind in ('file','link')),
  title       text not null,
  url         text,                 -- for kind='link'
  file_path   text,                 -- storage path, for kind='file'
  file_name   text,
  mime_type   text,
  category_id uuid references public.tn_categories(id) on delete set null,
  status      text not null default 'pending'
              check (status in ('pending','ready','failed')),
  excerpt     text,                 -- extracted/described text used for retrieval
  created_at  timestamptz not null default now()
);
create index if not exists tn_sources_status_idx on public.tn_sources (status);
create index if not exists tn_sources_category_idx on public.tn_sources (category_id);

-- ---------------------------------------------------------------------- tags
create table if not exists public.tn_tags (
  id    uuid primary key default gen_random_uuid(),
  slug  text unique not null,
  label text not null
);

create table if not exists public.tn_source_tags (
  source_id uuid not null references public.tn_sources(id) on delete cascade,
  tag_id    uuid not null references public.tn_tags(id) on delete cascade,
  primary key (source_id, tag_id)
);

-- ------------------------------------------------------- row level security
alter table public.tn_categories  enable row level security;
alter table public.tn_sources     enable row level security;
alter table public.tn_tags        enable row level security;
alter table public.tn_source_tags enable row level security;

-- The commons belongs to everyone: public read, authenticated write.
drop policy if exists "public read"   on public.tn_categories;
drop policy if exists "auth insert"   on public.tn_categories;
create policy "public read" on public.tn_categories for select using (true);
create policy "auth insert" on public.tn_categories for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "public read"   on public.tn_sources;
drop policy if exists "auth insert"   on public.tn_sources;
drop policy if exists "owner update"  on public.tn_sources;
drop policy if exists "owner delete"  on public.tn_sources;
create policy "public read" on public.tn_sources for select using (true);
create policy "auth insert" on public.tn_sources for insert
  with check (auth.role() = 'authenticated' and owner_id = auth.uid());
create policy "owner update" on public.tn_sources for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner delete" on public.tn_sources for delete
  using (auth.uid() = owner_id);

drop policy if exists "public read"   on public.tn_tags;
drop policy if exists "auth insert"   on public.tn_tags;
create policy "public read" on public.tn_tags for select using (true);
create policy "auth insert" on public.tn_tags for insert
  with check (auth.role() = 'authenticated');
drop policy if exists "auth update" on public.tn_tags;
create policy "auth update" on public.tn_tags for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "public read"   on public.tn_source_tags;
drop policy if exists "auth insert"   on public.tn_source_tags;
drop policy if exists "owner delete"  on public.tn_source_tags;
create policy "public read" on public.tn_source_tags for select using (true);
create policy "auth insert" on public.tn_source_tags for insert
  with check (auth.role() = 'authenticated');
create policy "owner delete" on public.tn_source_tags for delete
  using (exists (
    select 1 from public.tn_sources s
    where s.id = tn_source_tags.source_id and s.owner_id = auth.uid()
  ));

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public)
values ('source-files', 'source-files', true)
on conflict (id) do nothing;

drop policy if exists "public read files"  on storage.objects;
drop policy if exists "auth upload files"   on storage.objects;
drop policy if exists "owner delete files"  on storage.objects;
create policy "public read files" on storage.objects for select
  using (bucket_id = 'source-files');
create policy "auth upload files" on storage.objects for insert
  with check (bucket_id = 'source-files' and auth.role() = 'authenticated');
create policy "owner delete files" on storage.objects for delete
  using (bucket_id = 'source-files' and auth.uid() = owner);

-- ------------------------------------------------------------ seed categories
insert into public.tn_categories (slug, name, description) values
  ('security',      'Security',               'Application, network, and operational security'),
  ('identity-auth', 'Identity & Auth',        'OAuth, OIDC, PKCE, SSO, identity architecture'),
  ('crypto',        'Crypto & Markets',       'Digital assets, markets, on-chain data'),
  ('ai',            'AI & Machine Learning',  'Models, evaluation, AI safety and policy'),
  ('standards',     'Standards & RFCs',       'IETF, W3C, NIST and other formal standards'),
  ('research',      'Research Papers',        'Academic and industry research'),
  ('general',       'General',                'Everything else')
on conflict (slug) do nothing;
