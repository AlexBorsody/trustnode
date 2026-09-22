# Current work

Product direction: [STRATEGY](../Business/STRATEGY.md).
Technical contracts: [DESIGN](DESIGN.md). Updated 2026-09-21.

## Working agreement

One implementation owner: Codex in the desktop app. One active checkout:
`/Users/alexborsody/Projects/trustnode`, branch `main`.
Alex decides product direction. Other tools/agents advise only when requested;
old agent assignments are retired. Build the product, keep checks proportional,
and update this queue instead of creating more handoff documents.

## Built

- SSO account flow: Google/Microsoft adapters, JIT creation through Supabase Auth,
  PKCE callback, dedicated login/signup, first-login onboarding, account profile
  and sign-out. Buttons reflect enabled project providers; live SSO is not activated.

- Link contribution, source shelf/search, owner source API operations, file extraction.
- Owner source shelf controls: edit title/description with retained failed drafts,
  confirm deletion, and preserve files when a referenced-source delete is rejected.
- Public charter aligned with the retained v1.1 principles and version record.
- Source packs: ordered links and notes, topics/tags, private/public visibility,
  public sharing, and independent copies (PR #4).
- Owner pack edits/deletion: atomic ordered saves, captured revision checks,
  recoverable drafts, and explicit deletion confirmation. Requires migration 004.
- Attributed forks: captured parent revision, independent copies, immutable origin
  records and visibility-aware attribution. Requires migration 005.
- Nested topic browsing, pack search and side-by-side comparison of source membership,
  ranks and notes. Comparison uses caller visibility; browsing requires no new migration.
- Two-parent merge drafts: explicit source/note choices, independent private saves,
  both captured revisions, and per-parent visible attribution. Requires migration 006.
- Explorer and retrieval API with visible ranking factors and pack scope (PR #5).
- Canonical verification isolated from community ranking; pipeline 0.3.0.
- Node setup, API input validation, existing regression checks and CI.
- Homepage entry points for exploration/curation, source-shelf navigation and 25-row
  pagination, loading/empty/retry states, recoverable contribution/sign-in failures,
  and empty-claim feedback (BUG-006/007).

These are implementation milestones, not a claim that every production flow works.

## Workspace status

Consolidated onto `main`; documentation conflicts resolved. Strategy is canonical.
Redundant docs and historical assignments are removed from the active tree;
old work is preserved in Git history and the local recovery archive.
Product work resumed in the desktop workspace after consolidation.

## Next

**Active priority — architecture before further implementation.** The full plan is
in [DESIGN, target architecture](DESIGN.md#target-architecture--planned-not-implemented),
revision `plan-1` (2026-09-21). It covers the trust engine, category templates,
community curation, evidence, RAG and the later controls as one system. This planning
change ships no application code or migrations. Strategy remains canonical.

Implementation follows the sequence below: trust ranking first, RAG second,
granular controls last. Production activation proceeds with Muse in parallel.
The existing OAuth/PKCE verification demo remains separate from new graph scores.

1. Activate and verify pack persistence in production. The live read still returned
   503 on 2026-09-21;
   direct Supabase read returned PGRST205 (tn_packs missing from schema cache).
   Apply migrations `003-source-packs`, `004-pack-editing`, `005-pack-ancestry`, and `006-pack-merge`
   from `db/` in that order
   through an authorized database session; check applied state before rerunning.
   No authenticated dashboard/DB session is available to this desktop task.
   The local public app credentials cannot run migrations. Migrations
   001b/001c were previously reported applied. Do not infer DB state from deployment.
   After activation: verify private/public reads, owner edits and deletion, two-tab
   stale-save recovery, and second-account ownership isolation in an authorized test account.
2. Activate SSO providers and verify real first/returning-user sign-in. Public Auth
   settings checked on 2026-09-21: email enabled, Google/Microsoft disabled, signup
   allowed, SAML disabled. Google/Microsoft OAuth credentials and callback allowlists
   need an authorized project session. App wiring uses existing Supabase ownership;
   no identity provider configuration or real user account was changed here.
   Google/Microsoft are the current default pending Alex's provider preference;
   enterprise SAML organization SSO would be a separate integration.
3. Start implementation with step 1 below, then finish the trust workspace through
   step 6 before expanding RAG. The design's proposed methodology defaults are
   implementation specifications, not claims that algorithms or authority decisions
   have already shipped. No further feature implementation is part of this planning task.

## Implementation sequence

Each step is a focused deliverable on `main`. The detailed schemas, formulas,
privacy rules and interfaces live only in DESIGN; this table tracks execution.
Steps are **planned**, except the existing portions explicitly identified in step 0.

| Step | Build and integration work | Dependency | Complete when |
| --- | --- | --- | --- |
| 0. Activate the foundation | Inspect/apply 003–006, enable chosen SSO providers, verify JIT and ownership in production. Reuse existing code. | Muse's project/provider access | Two real accounts can sign in, manage their own packs and see only permitted private data; migration results recorded |
| 1. Model sites, categories and template versions | Add stable site/resource mappings, category IDs, explicit seed roles and immutable pack-version capture. Preserve existing pack revisions and forks. First additive migration begins at 007. | Existing schema; live activation needed only for production | A saved template version contains a fixed category, members, seeds, weights and rationale; duplicate pages cannot multiply site seed mass |
| 2. Record the evidence graph | Add relationship revisions, evidence locators, policy acceptance and challenges; minimal contributor/reviewer UI. Distinguish observed links from accepted propagation edges. | 1 | A curator can record a citation/conflict, choose eligible edges for their template and inspect who supplied/accepted them |
| 3. Implement pure graph computation | Build site/resource projections, seeded PageRank, deterministic ordering, convergence and exact contribution accounting. No query or LLM dependency. | 1–2 contracts; implementation can use a small reviewed fixture | A nonseed receives rank through accepted evidence; a seed/edge change produces an explained difference; identical inputs replay |
| 4. Persist and publish runs | Freeze snapshots transactionally; add run/score/history storage, leased jobs, restricted worker and atomic publication. Add trust/seeds/graph read APIs and JSON export. | 1–3; worker deployment for persistent production jobs | A completed leaderboard and every explanation reference the same immutable inputs; retries/failed runs cannot publish partial scores |
| 5. Build the trust workspace | Category/template chooser, separate site/resource tables, focused graph, score explanation, conflicts, seed-only/stale states and run comparison. | 4 | A user can answer “why is this site ranked here?” before typing a research question, and inspect every contributing relationship |
| 6. Complete the shared-template workflow | Extend existing publish/fork/merge flows to include seed/policy versions; category hub cards, template comparison, separate adoption display, visibility-aware run sharing and challenges. | 5 and live step 0 for pilot | User A publishes a template; B inspects/forks/reorders its seeds, computes an independent result and compares it without private-parent leakage |
| 7. Capture content and passages | Add bounded safe fetch jobs, source versions, hashes, parser provenance, passage anchors and observed links; retain failures and curator descriptions separately. | 4; builds on the existing public source shelf | A passage resolves to an identified captured page version; a failed fetch never appears as a verified quotation |
| 8. Integrate trust with retrieval | Indexed lexical passage search; explicit link subset/exclusions; pinned template and graph run; separate relevance/authority factors; token/context and per-source limits. | 6–7 | Relevant evidence comes only from selected accessible links; changing the question leaves trust unchanged; changing template uses a new explained run |
| 9. Add grounded research output | Server provider adapter, citation-structured response, citation checks, conflict/insufficient-evidence states, private saved research runs and explicit sharing. | 8 plus model/provider configuration | A generated result cites available captured passages; invented citation IDs fail; provider failure still leaves useful evidence to inspect |
| 10. Add SourceSelect controls | Retrieval top-k/depth/filters, then supported temperature/top-p/sampling controls; persist effective settings without changing canonical trust. | 9 | Each control changes its stated layer and unsupported controls are absent. Deferred until the core works |

Release work accompanies each step: activate additive migrations separately from
code deploys, retain the previous current-run pointer for rollback, and run focused
checks on the changed behavior. No independent test expansion or unrelated source
editor polish interrupts this sequence. Broad-public-launch gates remain required.

### Delivery checkpoints for this week

Aim for the trust-workspace pilot, steps 1–6. Work in this order rather than opening
many parallel projects: identity/templates → evidenced graph → computation and
stored runs → inspection UI → two-user sharing/forking. Step 0 runs alongside this
with Muse; local development does not wait for production credentials. The pure
engine can use an explicitly labeled fixture while the first real category is
prepared. A fixture proves behavior, not real-world source reliability.

The first reviewable milestone is a small category graph with a published seed
set, one propagated nonseed, a recorded conflict and a fully explained site score.
The next is that same workflow driven by independently owned, shared templates.
Only then start steps 7–9. This is a scope target, not a promise that the entire
architecture, RAG and later controls fit in the remaining week. Record actual
progress here after each deliverable rather than substituting test counts for it.

### Decisions and external inputs

- **Resolved by this plan:** separate site/resource projections; exact-host identity
  initially; explicitly marked seeds; proposed uniform/ordered seed modes; accepted
  positive edges only; no automatic supersession transfer; append-only runs; public
  adoption separate from graph authority; RAG relevance separate from trust.
- **Technical defaults:** damping 0.85, tolerance 1e-6, cap 100, initial graph/job
  limits and retrieval-v2 coefficients are versioned proposals in DESIGN. Adjust
  with documented evidence during implementation; never relabel them measured accuracy.
- **Content/governance inputs:** Alex/Muse's real first-category seeds and evidence,
  reference-policy maintainers and launch policy remain pending below. These do
  not prevent users from building their own clearly attributed templates.
- **Deployment inputs:** existing Supabase/SSO access is needed for step 0; a worker
  host and restricted DB role for step 4; model/provider account and budget for step 9.
  Credentials belong in secure configuration, not Markdown. No new approval flow
  is implied for routine implementation; record actual access and decisions here.

## Muse coordination — inputs to unblock delivery

Muse: use this section for replies, decisions and setup results. Codex continues
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
  `006-pack-merge`. Record each actual application result here. 001b/001c were
  previously reported applied; 003–006 have not been applied by Codex. The observed
  production pack API returned 503/PGRST205. Deployment success is not DB readiness.
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

## Latest delivery check — 2026-09-21

Owner source controls and charter alignment: typecheck, production build and 35
focused API checks pass. Referenced-source deletion preserves the backing file;
malformed edits fail before database calls. Browser fixtures confirm owner-only
controls and saved title/description updates on the shelf. Muse inputs are above.

Merge: 37 focused pack/API checks, production build and disposable PostgreSQL
engine checks pass, including two captured revisions, atomic rejection, private
child/parent visibility and deletion preserving the other origin and child. Local
browser fixtures verify source/note selection, reorder, stale-draft recovery,
private saved merges and independent parent attribution.
Hosted application/build and PostgreSQL CI passed for merge at `effe83d`.
SSO: 33 focused API/redirect checks and production build pass. Disposable browser
fixtures verify PKCE exchange for Google and Microsoft adapters, first-login
onboarding/profile save, local sign-out and returning-user routing. No real provider
login was attempted; live activation remains item 2.
SSO hosted application/build and PostgreSQL checks passed at `50f91b1`.
No production data or migrations were changed. Live readiness remains items 1–2.

## Review — 2026-09-21 (Habib, commit `50f91b1`)

Secret handling is correct: the browser uses only `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
`/api/auth/providers` uses the server-side `SUPABASE_ANON_KEY` to read public
`/auth/v1/settings`. No service-role/client secret in the client bundle or the
repo. Return-to URLs are allowlisted (`safeReturnTo`), covered by tests.

Findings for Codex, in priority order:

1. Env var name split — fix before activation. The client reads
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` while the providers
   route reads `SUPABASE_URL`/`SUPABASE_ANON_KEY`. If only the `NEXT_PUBLIC_` pair
   is set, the route silently returns `{ providers: [] }` and the UI reports
   "SSO sign-in is being configured" even though auth works. Have the route fall
   back to the `NEXT_PUBLIC_` vars, or document that both pairs must be set.
2. Azure `scopes: "email"` — verify at activation (item 2). Microsoft identity
   platform requires the `openid` scope for OIDC; if Supabase replaces rather than
   merges default scopes, the Azure flow breaks with no ID token. Confirm a real
   Microsoft sign-in completes before calling SSO live.
3. Minor: `useAuth` calls `client.auth.initialize()` then `getSession()` on top of
   `onAuthStateChange` (which already fires `INITIAL_SESSION`) — harmless but
   redundant; one session-restore path is enough.

### Codex response — 2026-09-21

- Review item 1 fixed: provider discovery and the server Supabase client fall back
  to `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` when server aliases
  are absent. The provider check covers a public-pair-only deployment.
- Item 2 remains a real-provider activation check. The official Supabase Microsoft
  guide uses `scopes: "email"`, matching the adapter; local PKCE checks do not prove
  Microsoft's configured tenant/app behavior. Keep real sign-in pending in item 2.
- Item 3 retained intentionally: `initialize()` exposes callback initialization
  failures, while `getSession()` obtains the restored session. The shared singleton
  prevents duplicate clients; the auth callback browser check verified a cancelled
  flow surfaces an error. `INITIAL_SESSION` alone does not carry that error.
- Muse setup/decision checklist and reply area are above. Other completed work in
  this batch: owner source title/description editing and guarded deletion, plus
  public charter alignment. No production credentials, providers or DB changed.

## Resumption context

Continue in this checkout on `main`; Strategy is locked. Routine commits/pushes
are authorized, with proportional checks. No separate agent owns unfinished work.

- SSO UI/session helpers are in `src/auth`, provider availability in
  `/api/auth/providers`, and callback/onboarding in `/auth/callback` and `/account`.
  Public settings must confirm enabled providers; do not claim live SSO from a fixture.
- Topic/compare helpers are in `packs/browse.ts`; comparison UI is in
  `PackComparison.tsx`, opened from `PackWorkspace.tsx`. Topics use `>` paths within
  the existing category field. Browse and comparison choices are capped at 50 packs.
- Merge is migration 006 and `merge_of` in the pack API/editor. Both captured parent
  revisions stay fixed through draft edits. Read APIs return only visible `origins`;
  the compatibility `origin` is the first visible one, with no total-parent count.
- Ancestry is in migration 005, pack creation/detail routes, `packs/model.ts`, and
  `PackWorkspace.tsx`. DESIGN records storage, privacy and locking choices.
- Copies before migration 005 have no inferred ancestry. Parent attribution uses
  current visible metadata, not a historical title/owner snapshot. A deleted parent
  removes its origin row; the child remains. Ancestry never affects retrieval scores.
- Copies use a narrow definer RPC to lock another owner's public parent without
  weakening owner-write RLS; new children always belong to the authenticated caller.
- Node/npm/gh are in `~/.local/bin`. SQL checks use a disposable database, never
  production. Temporary browser fixtures are optional aids, not app dependencies.

## Remaining limits and decisions

- Canonical evidence is still a seeded OAuth/PKCE demo with illustrative fixtures;
  source quotation/provenance cleanup and broader domain coverage remain unfinished.
- Shelf search does not match tag labels.
- Confirm reference-policy maintainers and new canonical seed domains with Alex;
  user-owned templates can proceed under the scoped governance in DESIGN.
- Implement the planned immutable graph runs and recorded evidence before claiming
  graph-derived trust. Measured reliability remains separate future work.
- Before broader launch: bounded fetch/SSRF protection, upload MIME checks,
  attachment handling, rate limiting, and moderation.
- Votes/verification badges, audit history, personal confidence overrides, and
  downstream summarization controls remain deferred.
- Source title/description editing uses the existing API and is currently last-save-wins;
  unlike packs, source records do not yet have revision tokens. Category/tag editing
  still needs an atomic update contract before expanding the owner editor.

## Recovery

Pre-cleanup tracked/untracked source files, patches, and all Git refs are saved
locally in `.recovery/2026-09-20-consolidation/` (ignored by Git).
`pending-product-ui.patch` is the original recovery copy of the now-resumed
homepage/error-recovery work; do not reapply it. Archive `README.txt` explains
restoration of older drafts. The named pre-consolidation stash is also retained. Superseded pipeline/file-parser
drafts are preserved there; the already merged implementations remain authoritative.
Historical reviews, QA reports, and old assignments remain available in Git history.
