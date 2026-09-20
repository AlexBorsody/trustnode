-- TrustNode Phase 0: file-content extraction (BUG-002, DESIGN §18).
-- Run once in the trustnode Supabase project's SQL editor, after migration-001.
-- Named 001b (not 002) so the Phase 1 graph migration keeps its DESIGN.md number.

alter table public.tn_sources
  add column if not exists extracted_text text;  -- deterministic extraction output, ≤200KB

alter table public.tn_sources
  add column if not exists extract_error text;   -- reason when extraction fails (status='failed')
