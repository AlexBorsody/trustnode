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

**Active product priority — 2026-09-21:** complete the category-template → selected
links → ranked passages → cited research result workflow. Alex clarified that
users should create, publish and reuse ranked source sets by category, with a
sharing/forking experience like a model/dataset hub. Existing packs supply the
ownership, category, ordering, sharing and ancestry foundation. Strategy remains
unchanged; category templates should build on packs rather than create a competing
collection system. Production activation below proceeds with Muse in parallel.

The current explorer is incomplete for this purpose: it matches titles, keywords
and short excerpts, scopes to one pack, and counts public adoption. It does not
retrieve page passages, apply the selected pack's rank as a distinct preference,
let users select a subset of its links, or generate grounded answers. These are
implementation gaps, not shipped RAG capabilities.

Delivery order for this workflow:

- Start with link content and provenance: bounded, SSRF-safe ingestion; store page
  text separately from editable curator descriptions, with fetch time, content
  identity and explicit failures. Produce addressable passages traceable to the
  retrieved page version. Descriptions and demo seed text must not masquerade as
  captured quotations. Fetch safety is part of this work, not deferred past it.
- Connect template/link selection to passage retrieval. Honor caller visibility,
  retain the selected pack revision, and expose query relevance, seeded authority,
  selected curator order and public adoption separately in a versioned formula.
  Excluded links stay excluded; a failed selection must not broaden the corpus.
- Make the workflow usable from category browsing and pack detail: choose a
  template, select links, ask a question, inspect ranked passages and citations,
  then save/share/fork the curated pack. User templates need no canonical seed
  endorsement; new canonical authority assignments still require Alex's decision.
- Add generation over those retrieved passages, with citation validation and
  explicit insufficient-evidence behavior. Model output never assigns trust or
  silently changes canonical confidence. Provider/model setup belongs in the Muse
  coordination section when the adapter's concrete requirements are known.

Completion means a user's changed link selection or curator ranking visibly
changes the retrieved evidence used by the research result, with inspectable
provenance. More CRUD polish or a context export alone does not complete this path.

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
3. After the active retrieval workflow, record inspectable evidence relationships, with explicit contributor/provenance;
   keep community relationships separate from canonical authority. Resolve the
   remaining graph/seed decisions before claiming graph-derived trust.
4. Finish the release workflow: source provenance cleanup,
   source category/tag editing, and the launch hardening listed below. Target this week's
   usable core workflow; discretionary controls stay deferred. Grounded research
   output is part of the active workflow above, after passage retrieval exists.

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
- Decide community tagging authority and new canonical seed domains before graph work.
- Define immutable graph runs, edge governance, and actual recorded evidence factors
  before claiming graph-derived trust or measured reliability.
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
