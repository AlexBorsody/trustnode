# Current work

Updated 2026-09-25. [Strategy](../Business/STRATEGY.md) is canonical and locked.
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
  Step 3 now computes deterministic site/resource graph authority with complete
  contribution ledgers. Step 4 implements local frozen snapshots, restricted
  worker jobs, stored replay artifacts and caller-scoped APIs. Step 5 now connects
  the trust workspace to those APIs: computation, rankings, frozen explanations,
  comparison, exports and explicit publication. Step 6a adds independent forks of
  selected saved versions, with optional evidence imports requiring local review.
  Step 6b merge reconciliation is committed at `cae27cd`; the complete local
  browser workflow and hosted PostgreSQL concurrency gate passed. PM accepted this
  as a local milestone. Step 6c category-scoped saved-template discovery is implemented
  locally at `14e5217`; browser and hosted CI passed. Independent PM review found
  no blocking defect; PM accepted the local milestone. Step 6d optional independent-
  reference comparison is implemented at `59cf8fd`; browser/hosted CI and independent
  PM review passed; PM accepted the local milestone on 2026-09-25.
  Production migrations 012–016 and worker activation are pending; the live app
  has no graph rankings or saved-template fork workflow yet.
  Passage indexing and generation remain unbuilt.
- **Preview:** [TrustNode on Vercel](https://trustnode-lemon.vercel.app) shows the
  existing app, not the proposed architecture. A successful deployment does not
  establish database or SSO readiness.
- **Production, rechecked 2026-09-25:** the read-only SQL inventory confirms the
  recorded 003–011 baseline: source/pack/template/evidence tables have RLS, two
  sources remain, and packs/versions/edges/reviews are empty. Staged 012–016 objects
  and `tn_graph_worker` are absent. Public reads work; Google/Microsoft providers
  remain disabled and signup is open. No production changes were made during
  activation preparation. The operator sequence is in
  [DESIGN](DESIGN.md#production-activation-operator-sequence).
- **Earlier production verification, 2026-09-21:** migrations 003–011 are applied to the existing
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
  agent has an active code assignment. The technical PM in **Inspect TrustNode
  project state** assigns/reviews delivery through direct task messages and this
  ledger; the implementation task owns code and its delivery updates. Routine
  commits/pushes are authorized; keep checks proportional and do not create
  parallel branches or handoff files.

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
| Stored trust runs — local milestone | Consistent captures, fenced worker leases/retries, atomic results, RLS reads/exports and explicit publication | `7e8d942`; PostgreSQL CI passed; 012/worker production activation pending |
| Trust workspace — local milestone | Category/template selection, stored-run requests/status, site/resource rankings, frozen contribution/evidence explanations, comparison, exports and publication | `f99211a`; PM/CI passed; production activation pending |
| Independent template forks — local milestone | Exact selected seeds/mode/order/rationale; private owned child; optional imported proposals without inherited reviews; local recomputation; current-RLS attribution and safe retries | `7c6836e`; PM/application/PostgreSQL CI passed; migration 013 staged |
| Selected-version template merges — local milestone | Explicit metadata/member/seed reconciliation; private independent child; deduplicated unaccepted imports with separately visible origins; local review/recompute/compare | `cae27cd`; browser/application/PostgreSQL CI passed; PM accepted locally; migration 014 staged |
| Category template discovery — local milestone | Cursor-paginated saved versions, captured category filters, visible provenance, run availability, separate capped resource adoption and version-bound workflow links | `14e5217`; browser/application/PostgreSQL CI passed; independent PM review passed; migration 015 staged |
| Independent-reference comparison — local milestone | Explicit completed reference, newest-50 authorized cohort, distinct-site medians/coverage, unknowns, pinned pages/export and current-access revocation | `59cf8fd`, evidence `247041c`; PM accepted locally; browser/application/PostgreSQL CI passed; migration 016 staged |
| Deterministic graph engine | Separate site/resource projections, accepted-pair deduplication, seeded PageRank, exact contribution accounting, seed attribution and canonical replay | Step 3, 2026-09-22; pure computation only |
| Category seed templates | Exact-host site identities, private-safe category hierarchy, immutable captures with explicit seeds/rationale, equal or ordered weights, version links and JSON export | `376ac0a`; migration 007 applied 2026-09-21 |
| Production database activation | Applied 003–007; added/applied 008 to remove direct anon grants on older pack RPCs; live packs/source reads return 200 | Dashboard SQL session, 2026-09-21; SSO still pending |
| Existing explorer | Deterministic `retrieval-v1`, displayed factors, public adoption and private-pack scope; canonical verification isolated from curation | `ae98399`, `0b8a9cc`, `3714c44` / PR #5 |
| SSO/JIT account flow | Shared Supabase client, Google/Microsoft OAuth adapters, PKCE callback, first-login onboarding, account/profile/sign-out, enabled-provider discovery | `50f91b1`; live provider activation pending |
| Review/configuration fix | Preserved Habib's review; server Supabase clients/provider discovery fall back to the public env pair | Review `143f68e`; fix `ee0c98d` |
| Charter and collaboration | Public charter aligned with retained v1.1; Muse setup checklist and Markdown reply area established | `4eaabfe` |
| Architecture | Full trust graph → RAG → controls plan, schemas, formula, provenance, APIs, jobs, privacy, migration/rollback and phased completion criteria | `c788112`; earlier RAG-first queue is superseded |
| Runtime and verification baseline | Reproducible Node setup/CI, API validation and pipeline 0.3.0 correctness fixes; seeded OAuth/PKCE demo retained | `32bacb1`, `fe4ec96`, `a0b8dcb`, `a0a1545` |

## Next concrete deliverable

**Production activation — preparation complete at `f8f6f47`, pending PM review and
external setup.** Assigned after PM acceptance of step 6d (`59cf8fd`, evidence
`247041c`). No further feature work or RAG before this gate.

1. Done: read-only live schema/provider inventory, dated below. No production SQL
   mutations, provider changes, paid provisioning or explicit deployment in this task.
2. Rehearse 012 → 016 on a populated disposable 011 baseline. The existing SQL chain
   now compares retained source/file metadata, pack membership/order/notes, immutable
   seeds/hashes, evidence authors/reviews/challenges after every migration. Local
   PGlite rehearsal passed. The existing PostgreSQL runner now exercises actual
   worker process start/heartbeat, SIGTERM stop, pending-job restart, expired-lease
   recovery with a new token, restricted-login denial and command-line artifact
   replay. Hosted PostgreSQL and application/build CI passed on `f8f6f47`; logs
   were inspected (see validation record). Timestamp backdating represents
   lease expiry in this disposable rehearsal, not a timed production outage.
3. Prepared one [operator sequence in DESIGN](DESIGN.md#production-activation-operator-sequence):
   preflight/backup, ordered migration checkpoints, secure narrow-login provisioning,
   worker supervision/heartbeat, two-real-account end-to-end acceptance and
   nondestructive rollback. No new architecture/handoff document.
4. External inputs remain: worker host and deploy/secret access; chosen SSO provider
   registrations and tenant/signup policy; release URL/redirects; two real identities.
   Exact details are in the existing Muse checklist below. Supabase dashboard access
   already works; another database login is not currently needed from Alex.

After review and external setup, activate the production trust pilot and record
actual results. Shared abuse limits and verifier headline/charter reporting remain
open before broader launch. RAG and model controls stay behind this gate.

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
verification is pending. Steps 3–5 and the step 6a/6b fork/merge increments are
implemented locally; 6a/6b/6c/6d passed PM acceptance, browser and hosted CI.
Stored runs/forks/merges still need production activation.
Step 0 needs SSO; steps 7–10 remain todo.
Detailed contracts live in [DESIGN](DESIGN.md#target-architecture-and-implementation-plan).
Each step ends with a focused commit, relevant checks and a status update here.

| Step | Deliverable | Depends on | Completion condition |
| --- | --- | --- | --- |
| 0. Production activation — partial | 003–011 applied; configure SSO/JIT and verify two-user ownership | Provider setup | Real accounts use owned/private/public packs; actual DB/provider results recorded |
| 1. Identity and templates — implemented | Sites, categories, immutable pack versions and explicit seed roles | Existing schema | Local DB/API/browser flow verified; schema and RLS verified live |
| 2. Evidence graph — implemented | Append-only proposals/revisions, curator decisions, challenges and resolutions; saved-template editor/history | 1 | Local DB/API checks and hosted rollback flow passed; real-account acceptance pending |
| 3. Trust computation — implemented | Site/resource projections, seeded PageRank, contribution and per-seed accounting | 1–2 contracts | Synthetic nonseed propagation, independent seed masses, exclusions and exact replay verified; persistence/publication belongs to 4 |
| 4. Stored/public runs — local milestone | Frozen snapshots, scores, bounded jobs, restricted worker, explicit publication and read/export APIs | 1–3 | Enqueue/replay/isolation/retry and real PostgreSQL concurrency checks pass; production activation pending |
| 5. Trust workspace — local milestone | Category/template chooser, stored rankings, focused evidence, explanations, conflicts and comparison | 4 | Disposable DB-backed browser workflow and PM review passed; production activation pending |
| 6. Shared template hub — local milestone | 6a selected-version fork, 6b merge, 6c discovery and 6d independent-reference comparison accepted locally | 5; 0 for live pilot | Local browser/CI/PM acceptance passed; production activation and real-account acceptance pending |
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
Migrations 012–016 are staged; new schema work follows at 017. Never rewrite applied migrations. Keep previous
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

- **Read-only activation assessment, 2026-09-25, 21:29 EDT / Sept 26 01:29 UTC:**
  the authenticated dashboard and read-only SQL transaction work for project
  `nrxhyqzzozynemaxghba`; it reports healthy status. Observed sources=2 and
  packs/versions/edges/reviews=0. Baseline source/pack/version/edge/revision/review
  tables all have RLS. Graph runs/jobs/health, template origins/merge requests and
  enqueue/fork/merge/discovery/reference functions are absent; `tn_graph_worker`
  does not exist. This confirms 012–016 still need activation. The live app returns
  providers=[], signupEnabled=true, sources=2 and packs=[] (all successful reads).
  The dashboard shows no managed backups; establish the recovery copy in DESIGN
  before applying migrations. No production SQL mutations or settings changes were
  executed. This supersedes the Sept 24 dashboard-only assessment.
  Local `app/.env.local` contains only the server/public Supabase URL and anon-key
  pairs. No worker database URL, provider secret or privileged database credential
  is configured there. No Supabase/Vercel CLI login or worker-host deployment
  configuration was found in the known local locations. The existing Vercel web
  deployment and GitHub CI are available; neither establishes a running worker.
  Required inputs: select an existing background-process host (or a provider and
  authorized budget), give access to its deployment/secret settings, and complete
  the Google/Microsoft provider setup below. Creating the restricted worker login,
  storing its `TRUSTNODE_WORKER_DATABASE_URL`, applying migrations and verifying
  heartbeat/real-account execution remain implementation/setup work after that
  decision. Do not put credentials in Markdown. No production configuration was
  changed and no paid resource was provisioned during this preparation.
- **Database access — ready, 2026-09-21.** Alex authenticated the in-app Supabase
  dashboard. The `trustnode` project `nrxhyqzzozynemaxghba` matches the app's configured
  URL. SQL editor access works; no privileged credential was copied into the repo.
  A separate staging project has not been established.
- **Recovery transport — pending for activation.** The SQL editor session is
  usable; a libpq administrator connection and private backup destination are not
  configured locally. An authorized operator needs those to create and verify the
  recovery copy in DESIGN. Provide access through the operator's secret store,
  or record who will perform the backup; do not paste its credential here. This
  does not require another dashboard login.
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

- **Graph worker — production setup pending.** Migration 012 creates the NOLOGIN
  `tn_graph_worker` group and narrow job functions. After applying it, provision a
  dedicated LOGIN role inheriting only that group and choose the process host.
  Muse/Alex inputs: host/provider and service/project name, deployment/secret-settings
  access, and a budget if new paid hosting is required. The host must run a persistent
  Node 22.23.2 process, support supervisor restart/SIGTERM and reach the selected
  Supabase direct/session database endpoint with verified TLS. Record the service
  and secret location names only. Vercel's web request process is not this worker.
  Configure `TRUSTNODE_WORKER_DATABASE_URL` (and trusted CA if needed) on that host,
  pin Node 22.23.2 and run `npm run worker:graph` from `app`. The worker rejects
  privileged logins. App JWT/RLS access stays unchanged. Record the host, credential
  location, heartbeat and a real run result here; never commit the credential.
  The enqueue API returns 503 until a worker has polled within two minutes.
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

- Activation preparation (`f8f6f47`, 2026-09-25): local typecheck and populated-011
  PGlite upgrade/regression rehearsal passed. Hosted
  [application/PostgreSQL CI](https://github.com/AlexBorsody/trustnode/actions/runs/36208887352)
  passed on that exact commit, including build. Inspected PostgreSQL logs explicitly
  confirm unchanged retained data after every migration 012–016 and actual worker
  process start/heartbeat, graceful SIGTERM stop, pending-job restart, expired-lease
  recovery under a new token, restricted-login permission denial, unchanged prior
  canonical bytes and successful CLI replay. Expiry was backdated by disposable
  admin; this is PostgreSQL 16 on loopback, not production TLS/host supervision or
  real SSO acceptance. Existing capture/merge concurrency and reference privacy
  checks also passed. No app runtime or applied migration was changed.
- Step 6d PM acceptance: `59cf8fd` plus `247041c` accepted locally on 2026-09-25;
  production activation preparation is the next assigned gate.
- Independent-reference comparison (step 6d, `59cf8fd`, 2026-09-25): typecheck, production
  build and 51 pack/template checks passed. Pure math verifies duplicate sites,
  even medians, partial/zero coverage, known zero versus unknown, and stable ties.
  API checks bind reference/metric/category/fingerprint across pages and full export,
  reject changed scope/method and reauthorize revoked references. Disposable full
  trust/fork/merge/discovery/reference integration passed: 52 candidate versions
  proved the newest-50 limit and time/UUID ties after category/RLS/self-pack filtering;
  private candidates and unpublished/revoked runs remained unavailable; complete
  site masses included known zeros; reading comparisons preserved canonical graph
  output bytes. Hosted [application/PostgreSQL CI](https://github.com/AlexBorsody/trustnode/actions/runs/36208329873)
  passed on that exact commit; inspected logs confirm reference scope/RLS/revocation/
  graph immutability, discovery and real concurrent capture/merge cases ran. PM
  independently reviewed the implementation and reran focused math/API plus fresh
  disposable trust/reference integration without finding a blocking defect.
  Browser acceptance selected published fixture run
  `85618cd0-f6df-420d-b361-841375fe6367` explicitly as anonymous reader. Its 17 eligible
  candidates paged 12 + 5; partial coverage showed median `0.54054074` across 1/2
  sites, and 0/1 coverage stayed unknown/unscored at the end. The actual downloaded
  JSON contained all 17 rows, metric `median-site-authority-v1`, bounded selection,
  scope fingerprint and input hash
  `6706d81c44bd6ae5f14a72c3117406a2761f1ea1681e43a98460bac121b7a51a`.
  After the reference pack became private, a further export returned unavailable
  and cleared all comparison cards/export controls. Returning to chronological
  discovery showed normal adoption/no-run labels with no comparison scores.
  This used mocked Auth/REST with real disposable PGlite schema/RLS/RPCs and worker;
  it does not establish production or real SSO acceptance. Temporary tabs/processes
  are closed/stopped; the fixture is `template-reference-browser-fixture.mjs` under
  `/private/tmp/trustnode-db-check/`. No production migration was applied.
- Step 6c PM acceptance: `14e5217` plus `0c86627` accepted locally after independent
  code/API/database review, hosted CI and the recorded browser acceptance.
- Category discovery (step 6c, `14e5217`, 2026-09-25): typecheck, 49 pack/template checks and
  production build passed. Disposable trust/fork/merge/discovery integration passed
  stable cursor ties including microseconds, captured-category descendants and
  mutable-draft isolation, owner/anonymous RLS, parent hiding, unpublished-run
  non-disclosure, publication epoch revocation and matching `retrieval-v1` adoption.
  Private packs do not change public scope counts; repeat curator packs cannot
  stack influence. Adding public adoption and reading discovery left the recomputed
  canonical graph artifact identical. Hosted [application/PostgreSQL CI](https://github.com/AlexBorsody/trustnode/actions/runs/36207565704)
  passed on that exact commit; inspected logs confirm the discovery/RLS/adoption/
  graph-isolation cases and existing real concurrent capture/merge checks ran.
  PM independently inspected migration/API/model/UI and reran API/cursor and
  disposable trust/discovery integration, finding no blocking defect.
  Browser acceptance used mocked Auth/REST with real disposable PGlite migrations,
  RLS/RPCs and stored runs: 15 saved templates paged 12 + 3 without overlap, previous
  page restored, category filtering selected the intended versions, and inspection
  preserved the selected immutable version. Fork and merge controls opened for that
  version; the direct merge link retained its version ID. A private child's own
  completed propagated run was labeled nonpublic; no-run cards showed no graph
  ranking. Hiding a parent removed all its links from discovery while retaining the
  independent child and remaining origin. Signing out removed private cards; public
  cards remained available and 15 packs from one curator yielded adoption 1, 0.5
  and 0.3333 for ranks 1–3. This is local functionality, not real SSO/production
  acceptance. Temporary browser tabs/processes are closed/stopped; fixture launcher
  is `/private/tmp/trustnode-db-check/template-discovery-browser-fixture.mjs`.
- Step 6b PM acceptance: `cae27cd` plus evidence checkpoint `af7a502` accepted as a
  local milestone after independent review/integration, hosted CI and full browser
  workflow. Production and real-auth acceptance remain outstanding.
- Selected-version merge (step 6b, `cae27cd`, 2026-09-25): 47 pack/template checks, 43 API
  checks, 8 graph/comparison checks, typecheck and production build pass. Disposable PGlite integration
  passes two users' divergent fork policies, captured metadata/order reconciliation,
  explicit normalized seeds, duplicate import collapse, exclusion of evidence for
  omitted members, no inherited reviews, local review/recompute and unchanged parent
  evidence. It also checks stale/hidden-parent atomic rejection, changed-key payloads,
  retries after hiding/deletion, deleted-child tombstones, combined copy bounds and
  independently filtered multiple origins. Child frozen exports contain no parent
  identifiers. Hosted [application/PostgreSQL CI](https://github.com/AlexBorsody/trustnode/actions/runs/36204360323)
  passed; its logs confirm same-key concurrent merge serialization, second-parent
  evidence fencing, capture/review isolation and restricted worker execution.
  The PM independently reviewed the implementation, reran disposable integration
  and verified this CI result without finding a blocking defect.

  Browser acceptance completed after the interrupted session resumed. The second
  user loaded two selected versions with different seed policies and a conflicting
  source note, explicitly chose the second parent's metadata/note, reordered the
  seeds and saved a private owned child. The displayed resource seed masses were
  2/3 and 1/3. Four parent evidence records became two unaccepted imports, each with
  two visible origins. The first run had zero eligible edges. Accepting the imported
  review → guide relationship locally and recomputing produced guide mass
  `0.36170199`; comparison showed unchanged seeds/method and changed evidence.
  Hiding the first parent and reloading removed its links/author (zero matches),
  while the second origin, child content, quotation and local acceptance remained.
  Auth/REST transport was mocked; migrations, RLS, RPCs, queue and worker ran against
  real disposable PGlite. This establishes the local browser workflow, not real SSO
  or production acceptance. Migrations 012–014 remain unapplied in production.

  The disposable browser database is saved under
  `/private/tmp/trustnode-db-check/merge-browser-db`; the adjacent
  `template-merge-browser-fixture.mjs` launcher serves it on 3272, with the app on
  3271 using process-only fixture env overrides. Both processes are stopped.
  Temporary acceptance tabs are closed. The fixture contains synthetic local data.
- Selected-version forks (step 6a, 2026-09-24): focused checks passed (45 pack/
  template, 43 API, 8 graph/comparison), as did typecheck and disposable PGlite
  integration. The latter verifies exact ordered seeds after parent/source edits,
  seeds-only versus proposal imports, no inherited decisions, local review and
  recomputation/replay, stale evidence/visibility rejection, same-request retries,
  changed-input rejection and deleted-child retry tombstones. Copying over 200
  proposals fails atomically while seeds-only remains available. Hidden/deleted
  parent cases retain child content/runs and expose no parent attribution IDs;
  frozen child inputs contain no parent author/version/evidence IDs.
  Browser verification used mocked Auth/REST transport with real disposable schema,
  RLS, RPCs and worker: the second user forked a selected version into a private
  pack with two proposed imports. The initial run had zero eligible edges. Local
  acceptance of the standard → guide relationship produced guide mass 0.45945926;
  comparison showed unchanged seeds and changed evidence. Hiding the parent then
  removed its links/author while retaining the import label, quotation and local
  decision. This is local functional verification, not production or real SSO
  acceptance. The production build passed. Hosted application/PostgreSQL CI runs
  passed for `7c6836e`. PM independently accepted the local milestone after rerunning
  fork API, type and disposable trust/fork integration checks.
- Step 5 PM review passed at `f99211a`: independently checked cancellation,
  artifact binding, URL safety, publication and RLS listing; focused application,
  type and disposable database checks passed. Hosted application/PostgreSQL CI
  passed, including real concurrent captures and restricted worker execution.
- Trust workspace (step 5, 2026-09-22): browser fixture exercised category/template
  selection → enqueue → real PGlite worker completion → site/resource rankings →
  frozen quotation and contribution ledger → owner publication. A second seed
  distribution produced the expected changed scores; comparison disclosed different
  evidence and seed inputs. A no-edge version explicitly displayed seed-only status.
  Delayed status responses were exercised while switching comparison runs and
  signing out in another tab; old data did not repopulate the selected view or the
  next account. The second account could read the published run, could not read
  unpublished runs and had no publication control. Private transition cleared the
  ranking on refresh; reopening the pack did not restore the old publication.
  Auth/REST transport was mocked; schema/RLS, capture, queue, worker and stored
  results were real disposable PGlite operations. This is not real-provider or
  production acceptance. Actual browser downloads were checked on disk: exact input
  SHA-256 and the canonical seed-only artifact matched; stored-byte replay passed
  integration. A stopped backend exposed an auth-service outage being reported as
  expired login; corrected this to 503 without reusing old ranking data. Eight
  focused graph/comparison checks, 43 API checks, typecheck, production build and
  database integration passed. The integration also
  checks the new current-public/public-readable metadata across visibility changes.
- Step 4 PM review passed: independent application/database checks, grants/lease
  fences/visibility inspection and verification that the actual PostgreSQL CI
  concurrency and restricted-login cases passed. No blocking defect reported.
- Stored runs (step 4, 2026-09-22): local disposable PostgreSQL-engine integration
  passes full enqueue → lease → compute → store → caller read/export → replay,
  capture of 25 relationships beyond the UI page, private/public ownership,
  visibility transitions, request-key aliases, stale lease fencing, conflicting
  completion, atomic nonconvergence rejection and bounded retries. API checks pass.
  Commit `7e8d942` passed [application and PostgreSQL 16 CI](https://github.com/AlexBorsody/trustnode/actions/runs/35692966904),
  including actual concurrent capture/revision and capture/review blocking, plus
  execution through a separately provisioned restricted LOGIN role and rejection
  of another login using a valid lease token. Typecheck and local/hosted builds
  passed. The concurrency gate is verified; the process host remains unconfigured.
  Migration 012 is not applied in production; no restricted production login,
  worker host or real-account acceptance has been configured by this milestone.
- Step 3 PM review passed at `7cbfd43`: six graph scenarios, typecheck and 30
  independent small-graph comparisons against a dense stationary reference, with
  contribution and seed-decomposition checks. No blocking defects reported.

- Graph engine (step 3, 2026-09-22): six focused scenarios verify the hand-computable
  A → B graph, independent site/resource seed masses, pair deduplication and policy
  exclusions, dangling/disconnected/unmapped cases, deterministic replay, seed
  decomposition and explicit invalid/oversized input failures. Contribution totals
  exactly reproduce raw final scores; seed components add within float64 tolerance.
  Typecheck, production build and existing pack/template and retrieval checks pass
  on Node 22.23.2. The focused graph check is included in CI.
  No production database mutation, real seed endorsement or stored run is claimed.

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

- The engine, stored-run backend, trust workspace and selected-version forks/merges are
  implemented and PM accepted locally; migrations 012–016, production worker/SSO
  activation, real-account acceptance and architecture steps 7–10 remain outstanding.
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
  candidates, `pipeline.ts` for canonical demo confidence. Implemented graph code lives
  in `app/src/trustnode/graph/`, separate from both existing scoring paths. The
  snapshot/worker adapter must freeze complete inputs before invoking it.
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
