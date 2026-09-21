# TrustNode technical contracts

Implements the [canonical strategy](../Business/STRATEGY.md).
Current methods: pipeline `0.3.0`, ranking `retrieval-v1`.

## Application

Next.js App Router on Vercel; Supabase Postgres, Auth, and Storage.
Pages: `/`, `/sources`, `/packs`, `/packs/:id`, `/explore`, `/verify`, `/charter`,
`/login`, `/signup`, `/account`, and `/auth/callback`.
Writes use the caller's bearer token and RLS. No app service-role key.
Private responses use `Cache-Control: private, no-store` and vary by authorization.
Missing database configuration/schema produces an explicit unavailable state.

## Authentication and user creation

User-facing authentication is SSO, with Google and Microsoft OAuth adapters.
Supabase Auth is the backend identity/session store. OAuth creates the user on
first successful sign-in (JIT) when project signup is enabled; returning identities
reuse their account. `/login` and `/signup` use the same provider flow; there is no
separate password or email-link signup form. Existing sessions remain compatible.
Enterprise SAML/domain SSO is not implemented by these OAuth adapters.

`GET /api/auth/providers` reads public Supabase Auth settings with a five-second
timeout and returns only enabled supported providers and signup readiness. No
management/service-role credentials, configuration secrets, or user records are
returned. Disabled providers are not presented as working buttons. Actual provider
credentials and redirect allowlists must be configured outside the app.

All browser surfaces share one Supabase client and session hook. OAuth uses PKCE
with automatic code exchange at `/auth/callback`; Microsoft requests the email
scope. Post-auth return destinations are restricted to known same-origin app pages.
Errors/cancelled flows return to sign-in. A first sign-in opens account onboarding;
optional display name and `onboarded` live in the user's auth metadata, never in an
authorization decision. Subsequent sign-ins return to the requested workflow.
Account sign-out revokes the local browser session; existing bearer-token/RLS
checks remain the authority for writes and private reads. Public pack attribution
continues to use account UUID, never email or mutable display name.

Provider setup references: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google),
[Microsoft](https://supabase.com/docs/guides/auth/social-login/auth-azure),
[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## Sources

`GET /api/sources`: public shelf; category/tag filters, title/excerpt search,
limit (maximum 100), offset, and stable created-time/ID ordering. The shelf UI
shows 25 rows per page, resets pagination on filtering, and offers retry on failure.
Search text does not currently match tag labels.
`POST /api/sources`: authenticated HTTP(S) URL contribution, exact-URL duplicate
response (409), best-effort metadata; contributor title/description take precedence.
`PATCH/DELETE /api/sources/:id`: owner operations. Shelf reads include public owner
UUID so only the owner sees edit/delete controls; bearer authentication and RLS
remain the actual authorization boundary. The editor updates title/description,
retains failed drafts across shelf filtering and confirms deletion. Editing these
shared details affects every pack using that source; curator notes/order are separate.
Source edits currently use last-save-wins, without pack-style revision tokens.
A foreign-key reference from a pack blocks deletion with a generic 409. Uploaded
storage is removed only after successful row deletion; cleanup failures are reported.
Category/tag editing remains API-only pending an atomic replacement contract.

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
by default. Fork ancestry is specified below; topic browsing and comparison use the same visible records.
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
under caller RLS; private, deleted, and absent ancestry return no visible origin.
Detail responses expose `origins` and the first visible `origin` for compatibility,
without a hidden-parent count or inaccessible IDs.
Current parent metadata is labeled as such, not a historical content snapshot.

`tn_fork_pack` atomically validates/locks the visible parent, checks revision,
creates the caller-owned child and origin, and validates link-only entries. This
narrow SECURITY DEFINER function is needed to lock another owner's public pack
without broadening owner-update RLS. It has a fixed search path, authenticated-only
execution, explicit auth/visibility checks, and no caller-supplied child owner/ID.
It cannot edit the parent or an existing child. Invalid entries roll back both
child and origin. Ancestry is provenance of the starting pack, not an assertion
that the edited copy agrees with it, and never affects ranking/confidence.

## Topic browsing and pack comparison

Pack topics may be curator-defined paths separated by `>`, for example
`Security > OAuth > PKCE`. Existing flat labels remain valid. Browsing normalizes
case/whitespace for matching and includes descendants when selecting a parent;
this is a navigation convention, not a centrally governed authority taxonomy.
Search matches pack title, description, topic and tags. Filters/counts cover only
the newest 50 caller-visible packs returned by the existing list API.

Comparison loads both details afresh through caller RLS and displays shared/unique
source records, each curator's rank and notes, owner, visibility and revision.
Source identity is the source record ID, not a fuzzy title/URL match. A differences
filter highlights membership, rank and note differences. Refresh rechecks access;
failed/hidden pack reads clear the previous comparison. Account/token changes
remount the comparison so private results cannot persist into another session.
Comparison itself is read-only. Signed-in users can select up to 50 unique sources
and either curator's note, then review/reorder/edit an independent private draft.
Existing drafts must be saved/discarded before starting a merge.

## Two-parent merge (migration 006)

POST `/api/packs` accepts `merge_of: [{id, revision}, {id, revision}]` instead of
`fork_of`. Exactly two distinct parents are required. Both revisions are captured
from the comparison used to start the draft. `tn_merge_pack` locks readable parents
in stable UUID order, checks both captured revisions, reuses constrained fork
creation, and records the second immutable origin in the same transaction. Any
failure rolls back the whole save. Missing/private parent returns generic 404;
changed parent returns 409 and retains the draft. Before 006, a merge fails as
unavailable, never silently saving without both origins.

006 changes the origin primary key to `(pack_id, parent_id)`; existing single-parent
forks and their function remain valid. Existing RLS applies independently to each
origin. Hiding/deleting a parent removes only that attribution from a reader's view,
not the other visible origin or the independent child. No stored total or merge-kind
flag reveals hidden ancestry. Source membership/order/notes remain curator choices;
merged provenance never changes canonical confidence or retrieval formulas.

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
