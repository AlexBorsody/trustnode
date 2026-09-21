# TrustNode technical contracts

Implements the [canonical strategy](../Business/STRATEGY.md).
Current methods: pipeline `0.3.0`, ranking `retrieval-v1`.

## Application

Next.js App Router on Vercel; Supabase Postgres, Auth, and Storage.
Pages: `/`, `/sources`, `/packs`, `/packs/:id`, `/explore`, `/verify`, `/charter`.
Writes use the caller's bearer token and RLS. No app service-role key.
Private responses use `Cache-Control: private, no-store` and vary by authorization.
Missing database configuration/schema produces an explicit unavailable state.

## Sources

`GET /api/sources`: public shelf; category/tag filters, title/excerpt search,
limit (maximum 100), offset, and stable created-time/ID ordering. The shelf UI
shows 25 rows per page, resets pagination on filtering, and offers retry on failure.
Search text does not currently match tag labels.
`POST /api/sources`: authenticated HTTP(S) URL contribution, exact-URL duplicate
response (409), best-effort metadata; contributor title/description take precedence.
`PATCH/DELETE /api/sources/:id`: owner operations.

Uploads accept PDF/text/Markdown/HTML/CSV/JSON, maximum 25 MB. Extracted text has a
200 KB cap; `extracted_text` is separate from the contributor excerpt. Failed
extraction records its reason. Links and normalized source records remain primary.
Server fetch uses a timeout; bounded response reading, SSRF prevention, MIME checks,
and rate limiting remain hardening follow-ups before broader public use.

## Source packs

`GET/POST /api/packs`, `GET/PATCH/DELETE /api/packs/:id`. A pack has title (1–120 characters),
description (up to 2,000), topic (1–80), up to ten tags (1–40 each), public/private
visibility, and 1–50 unique existing link sources with ordered ranks and notes
(up to 1,000 characters each). Owner attribution uses account UUID, never email.

Migration 003 creates `tn_packs`, `tn_pack_sources`, and `tn_create_pack`.
Creation is atomic, SECURITY INVOKER, and governed by caller RLS. Packs default
private. Anonymous users see public packs only; owners also see their private packs.
Source records themselves remain public. Copies create independent packs, private
by default. Fork ancestry is specified below; category trees remain deferred.
Lists return up to 50 visible packs; source selection searches up to 100 shelf rows.
Production migration activation is tracked separately from code deployment.

Migration 004 adds owner editing/deletion with `tn_update_pack` and `tn_delete_pack`,
both SECURITY INVOKER under RLS. PATCH replaces the full pack and ordered entries
atomically; DELETE removes the pack and its entries, preserving shared sources and
independent copies. Both requests require the `revision` captured when editing or
confirming deletion begins. A locked parent row prevents concurrent writes through
these functions from silently overwriting each other: stale revision returns 409;
missing/non-owned pack returns generic 404. Metadata and direct entry writes advance
revision, an opaque concurrency token; caller updates cannot change identity or ownership.
The editor retains failed drafts, offers explicit discard/reload after a conflict,
and confirms permanent deletion. Before migration 004, existing pack reads
remain supported and owner editing is labeled unavailable.

## Fork ancestry (migration 005)

POST `/api/packs` optionally accepts `fork_of: {id, revision}`. New drafts/copies
remain independent and private by default. Revision is captured when copying,
never silently refreshed while the draft is open. Hidden/deleted parent returns
generic 404; changed parent returns 409 and preserves the draft. Before 005,
ordinary creation/reads remain usable; attributed copies report unavailable rather
than silently saving without ancestry. Legacy copies cannot gain invented ancestry.

`tn_pack_origins` stores child, parent, captured revision and fork time, without
snapshot titles/owners. No caller writes; origin is immutable. RLS reveals the row
only if the viewer can currently read both packs. Parent deletion cascades only to
this origin row, not the child. Detail responses resolve current parent title/owner
under caller RLS; private, deleted, and absent ancestry all return `origin: null`.
Current parent metadata is labeled as such, not a historical content snapshot.

`tn_fork_pack` atomically validates/locks the visible parent, checks revision,
creates the caller-owned child and origin, and validates link-only entries. This
narrow SECURITY DEFINER function is needed to lock another owner's public pack
without broadening owner-update RLS. It has a fixed search path, authenticated-only
execution, explicit auth/visibility checks, and no caller-supplied child owner/ID.
It cannot edit the parent or an existing child. Invalid entries roll back both
child and origin. Ancestry is provenance of the starting pack, not an assertion
that the edited copy agrees with it, and never affects ranking/confidence.

## Retrieval

`POST /api/retrieve` accepts `query` (1–500 characters), `limit` (1–20, default 6),
`use_pack_signals` (boolean, default true), and optional `pack_id` (UUID).
Invalid input: 400. Inaccessible selected pack: generic 404. Invalid private-selection
token: 401. Unavailable selected-pack storage: 503.

Candidates require normalized term overlap. `retrieval-v1`:

```
relevance = 5 × distinct matched query terms / distinct query terms
seeded trust = 2 × clamp(analyst weight, 0, 10) / 10; community = 0
pack influence = min(2, sum per distinct public curator of best(1 / rank))
supersession penalty = 1 when explicitly superseded, otherwise 0
score = relevance + seeded trust + pack influence − supersession penalty
```

Factors round to four decimals, with stable ID ties and ordered summation.
Repeated terms do not inflate overlap. Multiple packs from one curator contribute
only that curator's best rank. This is a bounded curation signal, not Sybil resistance.
Private packs restrict their owner's candidate set but never feed public adoption.

Read limits: newest 200 ready community links, newest 200 public packs, at most
50 selected-pack entries. Report limits, counts, unavailable layers, and warnings.
Exact URL equality associates shelf entries with seed provenance. Duplicate URLs
prefer the seed representative. Explorer excludes illustrative `.invalid` URLs.
Public exploration can fall back to seeds when optional database layers are unavailable.

Results include numeric factors, matched terms, derivation, pack provenance,
controls, corpus status, and independent `canonical_verification`. Retrieval rank
is not factual confidence. Unmatched research topics say “No analyzed claim match.”

## Canonical verification

`POST /api/verify {claim}`: public and CORS-open; string of 1–500 trimmed characters.
Malformed/empty/oversized requests return 400. Supabase is optional for seed verification.
`PIPELINE_VERSION` in `app/src/trustnode/version.ts` is the version source of truth.

Pipeline: normalize → retrieve → stance → conflicts → confidence.
Normalization uses deterministic tokenization, stop-word removal, and simple stemming.
Stance patterns use token overlap; winning pattern has most hits, with threshold
`min(2, pattern count)`. Negation within four raw words of a matched keyword
mechanically flips supports/contradicts, preserves qualifies, and labels the result.
This heuristic is limited; it is not semantic understanding.

Seeds and supplemental community results are selected independently, up to `topK`
each (default six, thus up to 12 returned). Only seeds affect canonical confidence,
conflicts, or staleness. Community earned values are forced to zero. Votes and pack
controls never alter canonical results. Seed confidence:

```
support = min(1, sum(supporter earned / 10) / 2)
contra = min(1, sum(contradictor earned / 10) / 2)
stale = 0.2 if any relied-upon seed is superseded, otherwise 0
confidence = round(100 × clamp(support × (1 − 0.6 × contra) − stale, 0, 1))
```

Levels: 80+ well supported; 50+ partially supported; 20+ contested; otherwise
unsupported. Formula and evidence remain inspectable. Contradictions precede the
evidence chain. Standards do not expire by age alone. The current canonical corpus
is an OAuth/PKCE prototype and still contains illustrative fixtures and sample votes.
Do not claim general-domain verification or measured historical reliability.

## Future graph work

PageRank/TrustRank is a separate future algorithm, not today's retrieval formula.
Before implementing, define edge direction and authority, domain membership,
dangling-node handling, supersession transfer, deterministic ordering, versioned
seed/graph snapshots, and immutable computation/run IDs. Proposed damping 0.85,
100-iteration cap, and tolerance 1e-6 are draft, not shipped behavior.
Seed additions require Alex's domain/source decision. Community edges must not
silently become canonical authority. Cross-owner tagging policy is also unresolved.

## Delivery

Work in the desktop workspace on `main` unless isolation is actually needed.
Follow the work queue; update it when something ships or a real blocker changes.
Keep validation proportional. Existing CI covers application and database checks;
do not expand suites as a separate project. Record live migration results only
when observed. Secrets stay in local environment files, never docs or Git.
