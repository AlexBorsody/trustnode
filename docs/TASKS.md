# TrustNode Source Commons — Task + Bug Tracker

Working task and bug tracker for `docs/DESIGN.md`. Check items off as they land —
update this file in the same commit/PR that completes a task or fixes a bug, so the tracker stays real-time.
Legend: `- [ ]` open · `- [x]` done/fixed · `- [!]` blocked.

## Active bugs

- [ ] BUG-001: Stance engine has no negation handling — "PKCE does not protect against interception" can match support patterns. — DESIGN §4
- [ ] BUG-002: Uploaded file bytes are never parsed; only title/description are searchable. — DESIGN §4
- [ ] BUG-003: Homepage shows PROTOTYPE v0.1.0 while the pipeline reports 0.2.0 — version labels disagree.

## Fixed bugs

- [x] BUG-000: Verify returned UNSUPPORTED 0/100 for the PKCE claim — seed stance patterns too narrow, community sources had no stances. Fixed 2026-09-19 (enriched seed patterns + mechanical text-overlap stance for community sources, labeled unreviewed).

## Phase 0 — correctness (before anything new)

- [ ] Negation handling in the stance engine ("X does not protect…" must not match support patterns) — DESIGN §4
- [ ] Deterministic file-content extraction at upload (pdf/txt/md/html/csv/json) — DESIGN §4
- [ ] Regression suite: support, contradiction, qualification, negation, supersession, irrelevant keyword overlap — DESIGN §4
- [ ] RFC 7636 claim pinned as a permanent regression case — DESIGN §4
- [ ] Move `GET /api/sources` category/tag/q filtering into PostgREST + `pg_trgm` index + limit/offset pagination (currently filters in memory after limit) — DESIGN §§8, 19
- [ ] `PATCH`/`DELETE /api/sources/:id` (owner only; PATCH is how a `pending` source becomes `ready` — no update path exists today) — DESIGN §8

## Phase 1 — trust graph v1

- [ ] `tn_source_edges` table + migration (corroborates | cites | supersedes | contradicts) — DESIGN §7
- [ ] `tn_seeds` (versioned, disputable seed set) + migration — DESIGN §7
- [ ] `tn_trust_scores` + migration — DESIGN §7
- [ ] PageRank/TrustRank-style computation with inspectable weights — DESIGN §4
- [ ] `GET /api/graph`, `GET /api/seeds`, `GET /api/trust/:id` — DESIGN §8
- [ ] Migration 002: seeds from `sources.json` → DB (`origin='seed'` rows + `tn_seed_stances`) — DESIGN §7
- [ ] `trustrank-1.0` computation with fixture-graph exactness test (deterministic, published constants) — DESIGN §16
- [ ] Personal-trust overrides on `POST /api/verify` (`allow`/`block`/`weights`, labeled in response) — DESIGN §§8, 9

## Phase 2 — granular trust UI (secondary, deferred)

- [ ] Deferred until Phases 0–1 are done: SourceSelect-style knobs menu (granular trust controls — seed weights, thresholds, stance patterns, conflict rules) — DESIGN §6

## Phase 3 — community layer (LAST)

- [ ] Verified users — DESIGN §4
- [ ] Labeled voting (never merged into canonical confidence) — DESIGN §§4, 9
- [ ] Ranking — DESIGN §4
- [ ] Moderation queue — DESIGN §4
- [ ] Audit history — DESIGN §4

## Later — hardening backlog (after Phase 1, before any public launch)

Upload/security hardening, deferred per 2026-09-19 — functionality first.

- [ ] Server-side magic-byte MIME validation on upload (currently trusts client Content-Type) — DESIGN §21
- [ ] SSRF guard on link fetch (DNS resolve + private-range block, or drop server fetch) — DESIGN §§18, 21
- [ ] Per-IP rate limiting on POST endpoints — DESIGN §21
- [ ] `Content-Disposition: attachment` for non-viewable upload types — DESIGN §21

## Merge-conflict convention

- New tasks/bugs: append at the bottom of the relevant section, one line each.
- Status changes: flip only the checkbox character on that task's line; don't reword the line in the same commit.
- Fixed bugs: move the line from Active to Fixed and append the fix date + one-line cause.
- One branch per phase; PRs against main. If TASKS.md conflicts, keep both lines and reconcile — never delete a task line during a merge.
- DESIGN.md is the contract; this file is the checklist. Disagreements update DESIGN.md first.
