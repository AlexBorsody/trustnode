-- TrustNode Phase 0: trigram search for GET /api/sources (DESIGN §19).
-- Run once in the trustnode Supabase project's SQL editor, after migration-001.
-- Named 001c (not 002) so the Phase 1 graph migration keeps its DESIGN.md number.

create extension if not exists pg_trgm;

create index if not exists tn_sources_title_trgm_idx
  on public.tn_sources using gin (title gin_trgm_ops);

create index if not exists tn_sources_excerpt_trgm_idx
  on public.tn_sources using gin (excerpt gin_trgm_ops);
