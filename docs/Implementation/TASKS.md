# Current work

Updated 2026-09-21. [Strategy](../Business/STRATEGY.md) is canonical and locked.
[DESIGN](DESIGN.md) contains existing contracts and the full target architecture
(`plan-1`); this file is the single delivery ledger, work queue and Muse handoff.

## Current state

- **Priority:** transparent trust ranking of sites/resources within category seed
  sets → RAG using that trust signal → granular SourceSelect controls last.
  Trust is independent of the research query. Curation, graph authority, relevance
  and claim confidence remain separate, explained signals.
- **Code:** step 1 is implemented: migration 007, derived site/category identities,
  immutable seed-template capture and a working pack editor/read/export flow.
  Architecture `plan-1` was published at `c788112`. Step 2 now stores versioned
  evidence, decisions and challenges (011), with API and template-editor wiring.
  Graph computation, stored runs, passage indexing and generation remain unbuilt.
- **Preview:** [TrustNode on Vercel](https://trustnode-lemon.vercel.app) shows the
  existing app, not the proposed architecture. A successful deployment does not
  establish database or SSO readiness.
- **Production, verified 2026-09-21:** migrations 003–011 are applied to the existing
  Supabase project. `/api/packs` now returns 200 with an empty list, replacing the
  previous 503/PGRST205; the two existing sources are preserved. Pack/template and
  evidence tables have RLS; mutation RPCs require authenticated execution. The live
  provider endpoint still returns no enabled Google/Microsoft providers, with signup
  enabled. Source creation/editing now has an atomic, authenticated-only RPC; live
  transaction checks verified tags, rollback and ownership without retaining test
  rows. Evidence commit `1c3ede2` is deployed; source/pack reads and the scoped
  evidence read RPC return 200. Missing template/history routes return generic
  404s. Real-account app flows remain pending SSO configuration.
- **Workspace:** `/Users/alexborsody/Projects/trustnode`, `main`, one implementation
  owner in the desktop app. Consolidation/conflict cleanup is complete. No other
  agent has an active code assignment. Routine commits/pushes are authorized;
  keep checks proportional and do not create parallel branches or handoff files.

## Completed work

The ledger describes implemented behavior and documentation, not blanket live
production readiness. Earlier foundation work is retained and integrated.

| Area | Completed result | History |
| --- | --- | --- |
| Repository/docs organization | Consolidated onto main, resolved documentation conflicts, removed redundant active docs/assignments, retained recovery data and locked Strategy | `c2ff57d`, `18759b2` |
| Source foundation | Link contribution; filtered/searchable public shelf; owner APIs; file text extraction and explicit failures; normalized input validation | `39eb561`, `ea15f8d`, `b6f7b10`, `fe4ec96` |
| Source workflow | Homepage entry points, shelf pagination, loading/retry states and recoverable errors; owner title/description editing and confirmed deletion; files retained if pack references block deletion | `9e00256`, `1112e30` |
| Source database wiring | Atomic metadata/category/tag saves and file registration; immutable ownership/file identity and shared tag labels; caller-folder storage, bounded public metadata fetching, safe search/errors and bounded verification reads | `7257b7f` deployed; migration 009 applied 2026-09-21 |
| Direct source writes | Database CHECK enforces link/file identity, caller-owned file paths and supported MIME even when bypassing the RPC | `4ebea40`; migration 010 applied 2026-09-21; live rollback check passed |
| Pack creation and sharing | Ranked links/notes, topic/tags, ownership, public/private visibility and independent copies | `2e3717b` / PR #4; migration 003 |
| Owner pack management | Atomic edits/deletion, captured revision checks, stale-save rejection and retained drafts | `e04a49e`, `bdb2904`; migration 004 |
| Fork provenance | Immutable captured-parent ancestry, visibility-aware attribution, independent copies and stale-copy recovery | `72070ca`, `0b99c27`; migration 005 |
| Browse, compare and merge | Nested topics/search, membership/rank/note comparison, two-parent merge drafts and atomic saves with both captured revisions | `ada0210`, `effe83d`; migration 006 |
| Evidence relationships | Version-scoped manual proposals, immutable revisions, stale-protected curator decisions, challenges/resolutions and private-safe history APIs/editor | `1c3ede2` deployed; migration 011 applied 2026-09-21 |
| Category seed templates | Exact-host site identities, private-safe category hierarchy, immutable captures with explicit seeds/rationale, equal or ordered weights, version links and JSON export | `376ac0a`; migration 007 applied 2026-09-21 |
| Production database activation | Applied 003–007; added/applied 008 to remove direct anon grants on older pack RPCs; live packs/source reads return 200 | Dashboard SQL session, 2026-09-21; SSO still pending |
| Existing explorer | Deterministic `retrieval-v1`, displayed factors, public adoption and private-pack scope; canonical verification isolated from curation | `ae98399`, `0b8a9cc`, `3714c44` / PR #5 |
| SSO/JIT account flow | Shared Supabase client, Google/Microsoft OAuth adapters, PKCE callback, first-login onboarding, account/profile/sign-out, enabled-provider discovery | `50f91b1`; live provider activation pending |
| Review/configuration fix | Preserved Habib's review; server Supabase clients/provider discovery fall back to the public env pair | Review `143f68e`; fix `ee0c98d` |
| Charter and collaboration | Public charter aligned with retained v1.1; Muse setup checklist and Markdown reply area established | `4eaabfe` |
| Architecture | Full trust graph → RAG → controls plan, schemas, formula, provenance, APIs, jobs, privacy, migration/rollback and phased completion criteria | `c788112`; earlier RAG-first queue is superseded |
| Runtime and verification baseline | Reproducible Node setup/CI, API validation and pipeline 0.3.0 correctness fixes; seeded OAuth/PKCE demo retained | `32bacb1`, `fe4ec96`, `a0b8dcb`, `a0a1545` |

## Next concrete deliverable

**Implement sequence step 3: deterministic site/resource trust computation.**
Evidence proposals, revisions, curator decisions and challenges are now wired to
Supabase and the saved-template view (011). This records graph inputs; it does not
compute or publish a trust score.

1. Build the pure `graph-trust-v1` engine under `src/trustnode/graph/`, following
   DESIGN section 5: seeded PageRank, explicit dangling redistribution, stable
   ordering, convergence diagnostics and exact contribution accounting.
2. Build separate site/resource projections from captured template membership and
   the latest accepted relationship revisions. Only `cites`/`corroborates` propagate;
   deduplicate pairs, exclude same-site edges in the site projection, and report
   exclusions. Contradictions and supersession remain evidence, not negative edges.
3. Then implement step 4: freeze the exact graph inputs, queue bounded work, store
   runs and publish results atomically. Do not label a local computation as a
   completed production ranking before that persistence/publication path exists.

SSO activation and two-account acceptance remain with Muse. Shared abuse limits
and the verifier headline/charter report remain open before broader launch. Keep
RAG, model controls and unrelated UI/refactoring behind the trust engine.

**Reference seed collection v1 (OAuth/PKCE) — proposed 2026-09-21:** the first real
reference seed set is drafted at `docs/Implementation/reference-seed-oauth-pkce.json`:
3 seeds (RFC 7636, RFC 9700, RFC 6749 — equal seed mass per DESIGN section 3),
4 non-seed members (security-topics draft, Auth0/Okta PKCE guides, oauth.net), and
5 proposed relationships (1 supersedes, 3 cites, 1 corroborates). The two
`.invalid` illustrative fixtures are excluded and must not be migrated as proven
content. Prepare locators, quotations and observation dates before curator
acceptance/import through the evidence API. Reference status requires Alex's
recorded maintainer publication.

**Codex review of the seed draft:** use the implemented `uniform-seeds-v1` mode.
All three seeds share one exact host, so they create one site seed mass. The
proposed vendor/community citations point toward the RFCs; they do not give the
nonseeds incoming rank. This graph cannot yet demonstrate seed-to-nonseed
propagation. Preserve citation direction and find real evidence for any additional
edge. Corrected RFC 9700's rationale: it is BCP 240, with PKCE required for public
clients and recommended for confidential clients ([section 2.1.1](https://www.rfc-editor.org/info/rfc9700/#section-2.1.1)).
The draft remains proposed, not imported or accepted evidence.

## Implementation sequence

Steps 1–2 are **implemented and their schemas activated**; real-account signed-in
verification is pending. Step 0 still needs SSO. Steps 3–10 remain todo.
Detailed contracts live in [DESIGN](DESIGN.md#target-architecture-and-implementation-plan).
Each step ends with a focused commit, relevant checks and a status update here.

| Step | Deliverable | Depends on | Completion condition |
| --- | --- | --- | --- |
| 0. Production activation — partial | 003–011 applied; configure SSO/JIT and verify two-user ownership | Provider setup | Real accounts use owned/private/public packs; actual DB/provider results recorded |
| 1. Identity and templates — implemented | Sites, categories, immutable pack versions and explicit seed roles | Existing schema | Local DB/API/browser flow verified; schema and RLS verified live |
| 2. Evidence graph — implemented | Append-only proposals/revisions, curator decisions, challenges and resolutions; saved-template editor/history | 1 | Local DB/API checks and hosted rollback flow passed; real-account acceptance pending |
| 3. Trust computation | Site/resource projections, seeded PageRank and contribution accounting | 1–2 contracts | A nonseed earns rank through evidence; seed/edge changes are explained; identical inputs replay |
| 4. Stored/public runs | Frozen snapshots, scores, jobs, restricted worker, atomic publication and read/export APIs | 1–3; worker deployment for production | One completed run ties rankings and explanations to exact inputs; retries cannot publish partial results |
| 5. Trust workspace | Category/template chooser, rankings, focused graph, explanations, conflicts and comparison | 4 | User can inspect why a site ranks before entering a research question |
| 6. Shared template hub | Version-aware publish/fork/merge, category discovery, separate adoption and private-safe comparison | 5; 0 for live pilot | A second user independently forks and recomputes a template without private-parent leakage |
| 7. Content and passages | Safe bounded capture, immutable page versions, hashes, passage anchors and link observations | 4; scheduled after 6 | Passage citations resolve to captured versions; fetch failures and curator notes are not presented as quotations |
| 8. Trust-aware retrieval | Selected links/exclusions, indexed relevance and pinned graph run; visible separate factors | 6–7 | Query changes relevance but not trust; excluded/inaccessible sources never enter the context |
| 9. Grounded output | Provider adapter, citation checks, conflicts, private research runs and explicit sharing | 8; provider setup | Output cites available passages; invalid citation IDs fail; provider failure leaves evidence usable |
| 10. Granular controls | Retrieval top-k/depth; supported temperature/top-p/sampling controls | 9 | Effective session settings affect only their stated layer and never canonical trust; deferred |

**This week's target:** the trust-workspace pilot through step 6. First milestone:
small category graph, published seeds, propagated nonseed, recorded conflict and
fully explained site score. Next milestone: two users publish/fork/compare independent
templates. Step 0 proceeds alongside development. A fixture can prove engine behavior
while real category evidence is prepared; it cannot prove real-world reliability.
This is a scope target, not a promise that RAG and controls also fit this week.

**Release discipline:** code deployment and migration activation are separate.
Continue new additive migrations at 012; never rewrite applied migrations. Keep previous
completed runs for rollback. Formula/parameter changes require methodology versions.
Proposed constants are recorded in DESIGN, not treated as measured accuracy.

## Muse coordination — inputs to unblock delivery

Muse: use this section for replies, decisions and setup results. Codex owns
implementation on `main`; please coordinate here rather than creating branches or
editing application code concurrently. Strategy stays locked. Mark each item
**pending**, **ready**, or **decided**, with the date and what changed. Do not put
passwords, tokens, OAuth client secrets or database connection strings in this file.
Configure secrets in the relevant provider/project settings or an approved local
secret store; record only where access is available and the non-secret result.

### Immediate: production database and SSO

- **Database access — ready, 2026-09-21.** Alex authenticated the in-app Supabase
  dashboard. The `trustnode` project `nrxhyqzzozynemaxghba` matches the app's configured
  URL. SQL editor access works; no privileged credential was copied into the repo.
  A separate staging project has not been established.
- **Migration state — ready through 011, 2026-09-21.** Before applying, confirmed
  source/category tables existed, pack/identity tables and functions were absent,
  and category keys had no duplicate backfill collisions. Applied 003 (packs), 004
  (editing), 005 (ancestry), 006 (merge), 007 (templates), then 008 (explicit RPC
  grant repair). Verified final schema/RLS, six authenticated-only mutation RPCs,
  disabled direct snapshot writes and preserved source count. `/api/packs` and
  `/api/sources` return 200. These were manual SQL editor applications; do not assume
  the CLI migration-history table records them or blindly reapply them. 001b/001c
  were previously reported applied. No existing packs were present during 007's
  revision backfill; existing links were not automatically promoted to seeds.
  Before 009, confirmed no duplicate link URLs and one existing Markdown file.
  Applied 009 and exercised create/edit, tag preservation, rollback and cross-owner
  rejection inside a rolled-back transaction. Final source count remains two; no
  test records remain. The source RPC requires authenticated execution, ownership
  and shared-tag updates are denied, and the bucket enforces a 4 MiB limit.
  After restart, confirmed 010 was absent, 009's RPC remained present, and existing
  files had compatible attribution/MIME. Applied 010; direct foreign-path and HTML
  inserts failed while valid link/file RPC saves and edits passed in a rolled-back
  caller-RLS transaction. Source count remains two; no temporary rows remain.
  Applied 011 after confirming its tables were absent. Evidence revisions/reviews
  have RLS and no direct caller writes; mutation RPCs are authenticated only and
  the internal visibility-locking helper is not callable by app roles. The rolled-
  back evidence workflow passed without leaving sources, packs or proposals.
- **SSO provider choice — pending.** Confirm Google, Microsoft work accounts, both,
  or enterprise SAML through an organization IdP. Google/Microsoft OAuth adapters
  and JIT account creation are built. Enterprise SAML is a separate integration;
  if needed, supply IdP name, organization domains and non-secret metadata/issuer
  details. Also decide whether signup is open, invite-only or restricted to specified
  organizations/domains. Current project signup is open; code does not enforce an
  organization policy through client email matching.
- **OAuth setup — pending.** For each chosen provider, create/select its OAuth app
  and configure its client ID/secret directly in Supabase Auth. Use the existing
  Supabase project's `/auth/v1/callback` as the provider callback. For Microsoft,
  choose the permitted tenant/account types and set the tenant configuration;
  the adapter requests the required email scope. Record provider enabled status,
  allowed tenants and credential expiration date, without the secret value.
- **App URLs — pending.** Confirm whether the release uses
  `https://trustnode-lemon.vercel.app` or a custom domain. Configure Supabase Site URL
  and allow the app's `/auth/callback` redirect with its `next` query, for production
  and `http://127.0.0.1:3000` (plus localhost if used). Keep JIT signup enabled if open
  signup is selected. On 2026-09-21 public settings showed email only, Google/Microsoft
  disabled and SAML disabled. The UI intentionally shows no disabled SSO buttons.
- **Real-account verification — pending.** Make two authorized test identities
  available through the chosen provider's normal sign-in flow: a new user and a
  second distinct account. We need to verify JIT creation, returning-user identity,
  logout, private/public pack reads, owner-only edits, stale saves and fork/merge
  privacy. Local fixture checks already pass but do not establish live readiness.

### Infrastructure for later implementation steps

- **Graph worker — pending for step 4.** Confirm the job-process host and runtime
  budget. Provision the restricted worker DB role and queue access described in
  DESIGN; the public app keeps caller-JWT/RLS access. A local process is sufficient
  during development; persistent production jobs need a deployed worker. Record
  where secure credentials are configured, without their values.
- **Generation provider — pending for step 9, not a trust-engine blocker.** Supply
  the chosen provider/model, secure server credential location, spending limit and
  policy for sending user questions and selected source passages to that provider.
  Supported sampling parameters will determine which later UI controls appear.

### Product inputs for the next release slices

- **First research domain — pending.** Select the first non-demo domain and provide
  a small approved starting corpus: source URLs, why each is authoritative, dates
  or versions, and 3–5 representative claims/research questions. Mark example content
  explicitly. Current canonical verification remains the OAuth/PKCE seed prototype.
  Codex can implement the evidence interface without inventing domain authority.
- **Evidence/community governance — pending.** Decide who can propose evidence
  relationships and tags, who can accept/reject disputed records, and who moderates
  reports. Recommended starting scope: attributable community proposals remain
  separate from canonical evidence; no community edit silently changes confidence.
  A recorded relationship is not measured historical reliability.
- **Launch scope/contact — pending.** Confirm private pilot versus unrestricted
  public launch, expected initial audience/volume, and the support/moderation contact
  to display. Supply any required privacy/terms text and retention/deletion policy;
  Codex will not invent legal commitments. Public launch still requires the fetch,
  upload and abuse controls listed under Remaining limits.

### Muse replies / setup results

Add dated responses here, using the item names above. Codex will fold resolved
items into Next and DESIGN rather than maintaining competing handoff documents.

**Codex → Muse, 2026-09-21:** migrations through 011 are now applied; the database
setup blocker is resolved. SSO provider configuration remains pending. Once signed
in, select seeds in an owned pack, enter rationale, choose equal/ordered
weighting and save a template version. Check fixed contents after a pack edit,
version links/JSON, stale capture recovery and private/public visibility with a
second account. Two seed URLs on one site must not multiply that site's weight.
Record specific failures here with route, action, expected/actual result and
account role; omit credentials. Review `eaa7ebb` is preserved below. Its source
findings are addressed; resolution details and remaining issues follow the review.

**Codex → Muse, evidence update:** use a saved template with at least two members;
record a proposal with locators/quotations, accept it as curator, revise it as its
author and confirm the new revision is proposed while the old decision remains
in history. Challenges/resolutions are separate from acceptance. The seed draft
review above identifies import and propagation gaps. Upload conversion remains
parked under Alex's latest direction.

## Validation and review record

- Evidence (011): focused API and PostgreSQL-engine checks plus production build
  passed. Hosted caller-RLS transaction exercised create → accept → challenge →
  resolve → revise, rejection of stale revisions, and hidden-template isolation.
  All temporary rows rolled back; sources remain two, packs/evidence remain empty.
  The local browser fixture exercised sign-in → saved template → proposal →
  acceptance → revised proposal → preserved history. Commit `1c3ede2` passed
  [hosted application/PostgreSQL CI](https://github.com/AlexBorsody/trustnode/actions/runs/35683126868)
  and Vercel deployment. Live missing-template/history routes return generic 404;
  the anonymous scoped read RPC returns an empty list for unavailable scope.
  Source/pack reads remain 200. No real SSO provider was configured or exercised;
  live providers remain empty. Temporary preview processes were stopped.

**Supervisor review, 2026-09-21 (`8481e01`):** source INSERT bypass resolved by
migration 010, applied and verified live. Resume the evidence graph with migration
011; SSO configuration proceeds alongside it. The original findings are retained:

1. **Resolved — enforce source identity at the database boundary.** The disposable
   `db/tests/source-integrity.sql` suite passes, but an authenticated direct INSERT
   into `tn_sources` also accepts a file row with another user's `file_path`,
   `mime_type='text/html'` and `status='ready'`. Migration 009 validates these
   fields inside `tn_save_source`, while the retained table INSERT policy checks
   only the source owner. This reproduces forged source metadata, not a storage
   overwrite or private-file read. Enforce the applicable kind/URL/file-path/MIME
   invariants for direct writes as well as RPC saves. Preserve the caller-scoped
   RPC and prove legitimate saves still work; do not simply revoke INSERT and
   break its SECURITY INVOKER implementation. Add focused direct-write rejection
   checks for foreign file paths and unsupported file MIME types.
2. **P1 — unblock real users.** A fresh production read returned
   `providers: []`, `signupEnabled: true`, and an empty public pack list. Muse must
   configure the chosen provider; then exercise login, contribution, private/public
   packs, immutable capture and cross-owner rejection with two actual accounts.
   SQL fixtures do not complete this acceptance gate.
3. **Next feature — evidence relationships**, as scoped below; then explained
   propagation and stored runs. No RAG, model controls or unrelated refactoring.
4. **Before broader launch — existing open findings:** shared abuse limits and
   the verifier headline/charter report. Record exact claims and deployment when
   reproducing; repeated deterministic responses alone do not close that report.


- Crash recovery / 010: preserved the uncommitted supervisor note; main had no
  incoming commits. Focused direct-write checks and valid RPC saves passed in
  PGlite and the hosted rolled-back transaction. No existing source/file was
  rewritten. Database constraints preserve legitimate account-deletion attribution
  nulling and do not revoke the INSERT privilege required by the invoker RPC.
- Supervisor review at `8481e01`: pipeline, API, pack/template and retrieval checks,
  typecheck and production build passed on Node 22.23.2. The pipeline test used
  `node --import tsx test/run.ts` because the sandbox blocked the tsx CLI IPC socket.
  The existing SQL suite passed in disposable PGlite; a separate direct INSERT
  reproduced the source metadata bypass recorded above. This was not a live
  production write or a full PostgreSQL service run. Fresh production provider/pack
  reads succeeded; real-account browser acceptance and live schema reinspection
  were not performed. Only this delivery ledger was edited.
- Source wiring (009): focused API/database checks, typecheck and production build
  passed. A public metadata fetch succeeded with the bounded socket/DNS path.
  Live caller-RLS transaction checks verified source/tag saves, immutable shared
  labels, rollback and foreign-owner rejection, then rolled back all temporary
  records. Commit `7257b7f` passed [hosted CI](https://github.com/AlexBorsody/trustnode/actions/runs/35680171982)
  and Vercel deployment. Live `/api/sources?q=%28oauth%29` and `/api/packs` return
  200; anonymous source creation returns 401. Two repeated `PKCE uses a code
  verifier` requests returned identical verification responses. This narrow check
  does not resolve the broader headline report. No real SSO login was exercised;
  the live provider list remains empty.
- Production activation: inspected hosted schema before applying 003–008; verified
  final RLS/privileges and unchanged source count. Live pack/source/provider APIs
  return 200; providers remain empty. The 008 regression check reproduces explicit
  Supabase anon grants and verifies their removal. Signed-in production mutation
  flows have not been exercised; no accounts or sample packs were created.
- Step 1: focused pack/template checks, typecheck and production build passed.
  Disposable PostgreSQL-engine checks exercised identities, immutable/idempotent
  capture, stale/non-owner rejection and private category/version visibility.
  Local browser fixture completed SSO → owned pack → ordered seed capture → saved
  weights/rationale/fingerprint. No production migration or provider was changed.
- Prior application baseline `ee0c98d` passed hosted application/type/build and
  PostgreSQL checks ([CI run](https://github.com/AlexBorsody/trustnode/actions/runs/35665903138)).
  Local browser fixtures exercised owner source editing, SSO callback/onboarding/
  sign-out, pack merge/reordering and stale-draft recovery. These fixtures do not
  establish real-provider or production-database readiness.
- Pack PostgreSQL checks covered atomic saves, stale revisions, ownership and
  private/deleted-parent ancestry. No production data or migrations were changed
  by these checks. Architecture/documentation updates received document checks;
  they did not implement or validate the proposed graph algorithm.
- Habib's SSO review (`143f68e`): env fallback **fixed** in `ee0c98d`; actual Microsoft
  tenant/scopes behavior **pending live activation**; explicit auth initialization
  **retained** to surface callback errors alongside session restoration. Full review
  history remains in Git; there is no outstanding request to rewrite the auth flow.
- Habib's full-frontend review (2026-09-21, `main` @ `376ac0a`): `test:api` 35/35,
  `test:packs` 43/43 green. No secrets in the client bundle, no XSS sinks, no open
  redirects; IDOR checks pass (pack mutations go through ownership-enforcing RPCs,
  source PATCH/DELETE double-check `owner_id`, private packs 404 via RLS). Findings
  for Codex, priority order:
  1. SSRF in `fetchLinkMeta` (`app/src/app/api/sources/route.ts:166`): any
     user-supplied URL is fetched with `redirect: "follow"` and no private-range
     blocking — probes internal/cloud metadata endpoints. Reject private, loopback
     and link-local ranges; re-validate the final URL after redirects.
  2. Storage upload policy (`db/migration-001-sources.sql`): any signed-in user can
     write any path, including overwriting another user's file via the direct
     storage API. Constrain WITH CHECK to the caller's own folder.
  3. `text/html` in `ALLOWED_MIME` (`app/src/app/api/sources/upload/route.ts:28`)
     with a public bucket: uploaded HTML/JS is served from the supabase.co origin
     (phishing/malware host). Drop HTML from the allowlist or force
     `content-disposition: attachment`.
  4. `/api/verify` (`route.ts:56`) selects `extracted_text` for up to 200 rows per
     unauthenticated POST (~40MB worst case). Cap server-side — excerpt only.
  5. Raw DB `error.message` strings returned to clients in the sources routes and
     the upload route (DELETE partially fixed in `1112e30`). Use generic messages
     like the packs routes.
  6. Shelf search 500s when `q` contains parentheses (PostgREST `.or()` syntax).
     Strip parens the same way commas are handled.
  7. The 25MB upload cap is unreachable on Vercel (4.5MB serverless body limit).
     Use signed direct-to-storage uploads, or lower the cap and the UI copy.
  8. `owner_id` on sources and tag labels are reachable beyond intent via direct
     PostgREST (`tn_tags` "auth update" policy lets any signed-in user rewrite any
     label). Tighten, or document as intentional now the shelf exposes `owner_id`.
  9. No rate limiting on the open compute endpoints (`/api/verify`, `/api/retrieve`).
  Live pass (same day): /verify returned 100/100 WELL SUPPORTED while most shown
  evidence was UNRELATED/SUPERSEDED — the headline number is not earned by the
  visible evidence; identical claims returned different evidence sets despite the
  DETERMINISTIC label; /charter served two different principle sets minutes apart
  (likely a deploy/cache artifact — pin the canonical text).
- Habib's recheck (2026-09-21, `main` @ `8481e01`, before migration 010): Codex addressed 5 of the 9 in
  `7257b7f` — SSRF fixed with DNS-validated fetcher (`app/src/sources/link-meta.ts`,
  per-redirect checks), `text/html` dropped from `ALLOWED_MIME`, `/api/verify`
  selects excerpt only, DB errors genericized, uploads use server-generated
  `<uid>/<uuid>-name` paths with `upsert: false`. Still open at that commit: the storage *policy*
  lets any signed-in user write any path via the direct storage API (needs an
  additive migration — 001 cannot be rewritten), parens break shelf search, the
  25MB cap exceeds Vercel's 4.5MB body limit, `owner_id`/tag-label exposure via
  direct PostgREST, no rate limits on open compute endpoints. `test:api` 40/40 and
  `test:packs` 43/43 green after `npm install` (the 40 failures seen mid-recheck
  were the missing `ipaddr.js` in the local checkout, not a code regression).
- Supervisor directive (2026-09-21, narrowed): no file storage, ever. This supersedes the
  storage findings above and the whole `source-files` bucket model. Keep uploads
  minimal: accept only doc/docx and txt, plus pdf only if the conversion is trivial.
  Convert in memory to HTML with one library per format (e.g. mammoth for docx,
  escaped text for txt); only the converted HTML is kept, the file bytes are
  discarded immediately and never written to storage. Take the easiest route and
  build nothing on top of this — file handling is an unimportant feature. Remove
  the bucket flow, file-retention-on-blocked-delete logic, and the extracted-text
  sidecar model.
  DEPRIORITIZED 2026-09-21 (Alex): the doc→HTML conversion work is parked — do not
  spend further time on the conversion library or any upload rework. The shipped
  hardening (no HTML MIME, restricted storage, excerpt-only verify) stays; the
  conversion feature itself is off the active path until Alex re-approves. This
  item is now tracked from the TrustNode frontend-feedback thread, not the
  Prove-It Clock thread.

**Codex resolution, 2026-09-21:** findings 1–8 are addressed by migration 009 and
the source API changes. Fetching validates socket DNS addresses and every redirect,
blocks private ranges, and bounds time/stream size. Storage INSERT is restricted
to the caller's folder; production had no UPDATE policy, so the claimed overwrite
path was not established, but foreign-folder creation was possible. HTML MIME is
removed; API and bucket limits are 4 MiB. Verification reads only bounded excerpts
with a stable ID tie-breaker. Source APIs return generic errors and shelf search
sanitizes PostgREST punctuation. Public owner UUID attribution is intentional;
ownership/file identity and global tag labels are now immutable to callers.
Source metadata and tag replacement commit together. This does not add malware
scanning, shared quotas or versioned page capture. Finding 9 (shared rate limits)
and the headline/charter report remain open. A stable read order is not evidence
that the headline issue is resolved; reproduce with an exact claim and deployment.

## Remaining limits and deferred work

- The trust computation and architecture steps 3–10 are unbuilt.
  Current retrieval searches seed text/titles/short excerpts; it is not passage RAG.
- Canonical confidence remains an OAuth/PKCE demonstration with analyst weights
  and illustrative content. Provenance cleanup and real domain evidence are needed;
  graph authority must never be described as measured factual accuracy.
- Source edits remain last-save-wins. Category/tag edits are atomic but API-only;
  shelf search does not match tag labels. Storage/DB failures can leave orphaned
  files requiring reconciliation. Keep further CRUD polish behind trust delivery.
- Before broader public launch: shared quotas/rate limits, file-content handling,
  moderation, retention policy and real-account ownership verification.
  Relevant safeguards ship with ingestion/jobs, not as an unrelated project.
- Votes, verified-user badges, broad social features, measured reliability and
  personal canonical-confidence overrides are deferred. Graph publication/evidence
  history is part of steps 2–4; it is not deferred with unrelated social features.
- Worker deployment is needed for persistent jobs; model/provider configuration is
  needed only for generation. Neither is a reason to invent local production success.

## Resumption context

- Read Strategy → this queue → DESIGN. One checkout/owner, `main`. Use the sequence
  above; do not revive the superseded RAG-first priority or historical agent tasks.
- Existing code: `app/src/packs/` and pack API routes for curation; `app/src/auth/`
  for shared SSO; `app/src/trustnode/ranking.ts` for retrieval-v1, `retrieval.ts` for
  candidates, `pipeline.ts` for canonical demo confidence. Future graph code belongs
  in `app/src/trustnode/graph/`, separate from both existing scoring paths.
- Preserve captured revisions through drafts. Reads expose only currently visible
  ancestry; hidden/deleted parents reveal no counts/IDs, and child packs survive.
  Legacy copies have no invented origin. DESIGN holds the full implemented contract.
- Node/npm/gh are in `~/.local/bin`. Use disposable local databases/fixtures for
  development. No active background job, temporary browser fixture or agent owns
  unfinished product work at this checkpoint.

## Recovery

Pre-consolidation files, patches and Git refs are preserved in the ignored local
`.recovery/2026-09-20-consolidation/` archive and retained named stash. Its README
explains restoration. `pending-product-ui.patch` is historical recovery data for
already-resumed work; do not reapply it. Superseded specs, reviews and assignments
remain in Git history. Keep Strategy and the existing four-document map authoritative;
update this queue rather than creating another status/handoff document.
