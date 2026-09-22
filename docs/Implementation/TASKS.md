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
  Architecture `plan-1` was published at `c788112`. Evidence relationships, graph
  computation, stored runs, passage indexing and generation remain unbuilt.
- **Preview:** [TrustNode on Vercel](https://trustnode-lemon.vercel.app) shows the
  existing app, not the proposed architecture. A successful deployment does not
  establish database or SSO readiness.
- **Production, last observed 2026-09-21:** packs returned 503/PGRST205; migrations
  003–006 were not applied by Codex. Google/Microsoft providers were disabled;
  email and signup enabled, SAML disabled. These observations have not been
  rechecked during this implementation. New migration 007 also awaits activation.
  Muse setup results are below.
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
| Pack creation and sharing | Ranked links/notes, topic/tags, ownership, public/private visibility and independent copies | `2e3717b` / PR #4; migration 003 |
| Owner pack management | Atomic edits/deletion, captured revision checks, stale-save rejection and retained drafts | `e04a49e`, `bdb2904`; migration 004 |
| Fork provenance | Immutable captured-parent ancestry, visibility-aware attribution, independent copies and stale-copy recovery | `72070ca`, `0b99c27`; migration 005 |
| Browse, compare and merge | Nested topics/search, membership/rank/note comparison, two-parent merge drafts and atomic saves with both captured revisions | `ada0210`, `effe83d`; migration 006 |
| Category seed templates | Exact-host site identities, private-safe category hierarchy, immutable captures with explicit seeds/rationale, equal or ordered weights, version links and JSON export | Migration 007; implemented 2026-09-21, activation pending |
| Existing explorer | Deterministic `retrieval-v1`, displayed factors, public adoption and private-pack scope; canonical verification isolated from curation | `ae98399`, `0b8a9cc`, `3714c44` / PR #5 |
| SSO/JIT account flow | Shared Supabase client, Google/Microsoft OAuth adapters, PKCE callback, first-login onboarding, account/profile/sign-out, enabled-provider discovery | `50f91b1`; live provider activation pending |
| Review/configuration fix | Preserved Habib's review; server Supabase clients/provider discovery fall back to the public env pair | Review `143f68e`; fix `ee0c98d` |
| Charter and collaboration | Public charter aligned with retained v1.1; Muse setup checklist and Markdown reply area established | `4eaabfe` |
| Architecture | Full trust graph → RAG → controls plan, schemas, formula, provenance, APIs, jobs, privacy, migration/rollback and phased completion criteria | `c788112`; earlier RAG-first queue is superseded |
| Runtime and verification baseline | Reproducible Node setup/CI, API validation and pipeline 0.3.0 correctness fixes; seeded OAuth/PKCE demo retained | `32bacb1`, `fe4ec96`, `a0b8dcb`, `a0a1545` |

## Next concrete deliverable

**Implement sequence step 2: attributable evidence relationships.** Step 1 is
wired from SQL through API to the pack UI. Seed mass is now inspectable input;
it is not yet a propagated trust score.

1. Add migration 008 for append-only relationship revisions, evidence locators,
   scoped acceptance and challenges, following DESIGN section 4. Preserve author,
   category/template scope, relation type and the evidence behind each assertion.
2. Add caller-scoped proposal/review APIs. Observed links, accepted citations and
   claim-specific conflicts must remain distinct; private records cannot enter
   another user's public run or expose hidden IDs.
3. Add the minimal evidence editor/read flow for a saved template. Completion:
   a curator records and reviews a citation/conflict with attributable rationale;
   later revisions preserve the prior evidence and decision history.
4. Then implement deterministic site/resource projections and explained seeded
   PageRank (step 3), followed by frozen, atomically published runs (step 4).

This work can proceed locally while Muse handles production access. Do not start
passage ingestion, generation, tuning controls, unrelated CRUD polish or a separate
validation project ahead of the trust engine. Next milestones: record evidenced
edges, compute explained scores, then make that workflow usable and shareable.

## Implementation sequence

Step 1 is **implemented locally; production activation pending**. Other steps are
todo. Detailed contracts live in [DESIGN](DESIGN.md#target-architecture-and-implementation-plan).
Each step ends with a focused commit, relevant checks and a status update here.

| Step | Deliverable | Depends on | Completion condition |
| --- | --- | --- | --- |
| 0. Production activation | Inspect/apply 003–007; configure SSO/JIT; verify two-user ownership | Muse access | Real accounts use owned/private/public packs; actual DB/provider results recorded |
| 1. Identity and templates — implemented | Sites, categories, immutable pack versions and explicit seed roles | Existing schema | Local DB/API/browser flow verified; 007 activation pending |
| 2. Evidence graph | Relationship revisions, evidence locators, scoped acceptance and challenges | 1 | Curator can record, review and explain a citation or conflict; observations are separate from accepted edges |
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
Continue new additive migrations at 008; never rewrite applied migrations. Keep previous
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

- **Database access — pending.** Provide an authenticated Supabase dashboard/SQL
  session for the existing TrustNode project, or an authorized database connection
  through the local secret environment. Confirm the intended production project
  and whether a separate staging project exists. Public anon keys are already
  configured; another anon key will not unblock migrations.
- **Migration state — pending.** Inspect existing tables/functions before applying
  `db/migration-003-source-packs.sql`, `004-pack-editing`, `005-pack-ancestry`, then
  `006-pack-merge`, then `007-seed-templates`. Record each actual application result here. 001b/001c were
  previously reported applied; 003–006 have not been applied by Codex. The observed
  production pack API returned 503/PGRST205. Deployment success is not DB readiness.
  **007 backfill advances existing pack revisions once**; reopen any older drafts.
  It assigns site/category identities but does not automatically mark any seeds.
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

**Codex → Muse, 2026-09-21:** seed templates are ready for testing after 007 is
applied. In an owned pack, select seeds, enter rationale, choose equal/ordered
weighting and save a template version. Check fixed contents after a pack edit,
version links/JSON, stale capture recovery and private/public visibility with a
second account. Two seed URLs on one site must not multiply that site's weight.
Record specific failures here with route, action, expected/actual result and
account role; omit credentials. No new Muse notes were present at the latest fetch.

## Validation and review record

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

## Remaining limits and deferred work

- The central trust engine and architecture steps 2–10 are unbuilt.
  Current retrieval searches seed text/titles/short excerpts; it is not passage RAG.
- Canonical confidence remains an OAuth/PKCE demonstration with analyst weights
  and illustrative content. Provenance cleanup and real domain evidence are needed;
  graph authority must never be described as measured factual accuracy.
- Source edits remain last-save-wins. Category/tag editing needs an atomic contract;
  shelf search does not match tag labels. Keep these behind core trust delivery.
- Before broader public launch: fetch/SSRF bounds, upload MIME/attachment handling,
  quotas/rate limits, moderation, retention policy and real ownership verification.
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
