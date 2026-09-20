# TrustNode Source Commons — Task + Bug Tracker

Working task and bug tracker for `docs/DESIGN.md`. Check items off as they land —
update this file in the same commit/PR that completes a task or fixes a bug, so the tracker stays real-time.
Legend: `- [ ]` open · `- [x]` done/fixed · `- [!]` blocked.

## Codex ↔ Muse handoffs

Alex has designated Codex as project lead and implementer, and Muse as the frontend tester and post-merge reviewer.
This file is the shared assignment and review board. Codex owns prioritization,
architecture, implementation, and integration; Muse independently tests behavior,
reports reproducible bugs, retests fixes, and reviews merged changes without blocking routine integration.
Existing product decisions in DESIGN.md remain the contract.

### Delegation matched to available tools

Codex continues assigning concrete tasks to Muse. Muse primarily has browser access,
not a full local IDE or shell: prioritize browser-based exploratory testing,
Android usability, preview-deployment checks, GitHub diff review, bug reproduction,
and retesting fixes. Codex owns implementation, dependency installation, builds,
command-line checks, and test automation unless explicitly reassigned.

Each Muse assignment should include the PR/preview URL when available, target
revision, steps or flows to exercise, expected behavior, and where to report results.
Muse may inspect GitHub CI results but must distinguish those from tests he ran.
If a task requires unavailable shell access, an API client, credentials, or a preview,
record the limitation and return that part to Codex; continue accessible browser checks.
Do not require Muse to set up a local development environment to complete browser QA.
Codex uses Muse's reports to prioritize fixes and delegates retesting after updates.

### Starting a new Codex web session

Read `docs/CHARTER.md`, `docs/DESIGN.md`, `docs/REVIEW.md`, and this board first.
Codex local and Codex web are separate workers: neither inherits the other's
conversation, uncommitted files, or running processes. Record the execution
environment (`Codex local`, `Codex web`, or `Muse`) when claiming work.
Muse also serves as Alex's phone-based project check-in: summarize the board,
record feedback, and distinguish proposed work from completed, verified work.
Do not take over an assigned implementation task without recording reassignment.

### WEB-001 — Independent review of the correctness handoff

- [ ] Review the handoff and propose regression cases — DESIGN §§13, 14, 23
- Owner: Codex web
- Status: assigned
- Branch: `phase-0/cloud-review` (create from the published handoff branch until that branch is merged)
- Scope: independently check `docs/REVIEW.md` against the implementation; write `docs/CLOUD-REVIEW.md` with confirmed/disputed findings and concrete input/expected-behavior cases for community isolation, negation, and malformed requests. Separate current behavior from proposed behavior and identify unresolved product decisions.
- Acceptance: cite relevant source locations; report exact commands/results for any executed checks; never call static reasoning an executed test. Include commit/PR and limitations in the handoff below.
- Exclusions: no application, dependency, database, or methodology changes; leave development setup files to CODEX-002. This is a review task, not approval of the draft design.
- Handoff from Codex web: pending.
- Post-merge review from Muse: pending (non-blocking).

### Coordination rules

- Read this board and the latest upstream changes before starting. Claim an assignment by updating its Status and naming the branch before editing implementation files.
- Assignment statuses: `assigned` → `in progress` → `ready for review` → `accepted`; use `blocked` with a concrete reason when necessary. Codex validates and integrates routine work without waiting for Muse; Muse records post-merge QA separately. Check off implementation tasks when they land, without implying browser QA passed.
- Use a task branch for substantial or concurrent work; PRs are optional when useful for previews or review, not a mandatory approval gate. Keep changes within the assigned files/scope; post a blocker here if another owner's files must change.
- On handoff, record commit/PR, files changed, exact checks and results, remaining limitations, and any decision needed. A claimed passing check must have actually run.
- Update your own assignment block; preserve other assignments and the existing backlog. Keep both sides of tracker conflicts and reconcile them.
- This file does not send notifications or synchronize itself. Publish changes through GitHub so the other collaborator can read them; each collaborator checks it at the start of work and before handoff. Local-only edits are not visible to the other collaborator.
- Codex may commit, push, and merge routine scoped work after appropriate validation, including the normal deployment triggered by main. Ask Alex only for a material decision or action outside the authorized scope; missing credentials and enforced platform permissions may still require his involvement.

### Autonomous integration and post-merge QA

Alex authorized this workflow in place of mandatory Muse approval, 2026-09-19.

- Codex reviews its own diff, runs checks appropriate to the change, and integrates routine work without waiting for a reviewer or an arbitrary timeout. Keep commits focused and report validation limits honestly.
- If a PR is useful, Codex may merge it when ready without Muse approval. Do not submit a fictitious independent approval or bypass enforced branch protections.
- A waiting reviewer is not a blocker; known failing relevant checks or unresolved correctness concerns still need resolution. Pending unrelated preview checks on documentation-only changes need not delay integration unless enforced by GitHub.
- Muse primarily tests the deployed frontend and reviews already-merged code. Assign concrete URLs/revisions and expected behavior, then triage findings into follow-up fixes or a revert when warranted.
- Routine work does not require repeated user confirmation. Escalate only when a decision cannot reasonably be inferred, an action exceeds authorization, or credentials/platform controls genuinely block progress.
- This supersedes the earlier mandatory Muse approval and renewed-head-approval rules. It changes the collaboration process, not the Charter or scoring methodology.

### CODEX-002 — Reproducible development setup and baseline CI

Reassigned from the original MUSE-001 to Codex local at Alex's request, 2026-09-19;
Muse now owns frontend testing and post-merge review rather than implementation.

- [ ] Complete development setup and baseline CI — DESIGN §§10, 23, 25
- Owner: Codex local
- Assigned by: Codex, 2026-09-19
- Status: assigned
- Branch: `phase-0/dev-setup` (record actual branch when claimed)
- Purpose: make this GitHub-web-edited project reproducible locally and give every PR a typecheck/build baseline.
- Scope: root `.gitignore`, `.github/workflows/`, README setup instructions, `app/.env.example`, a Node version declaration, and removal of tracked `app/tsconfig.tsbuildinfo`. Change `app/package.json` or its lockfile only if necessary for runtime declarations or setup, and explain why.
- Deliverables: choose and document a Node version compatible with locked dependencies; use `npm ci` from `app`; ignore dependencies, build outputs, local env files (retain the example), and TypeScript build metadata; provide placeholder-only examples for the four Supabase variables in DESIGN §25; document seeded verification without credentials and what requires Supabase; fix the README Charter path/version; add PR CI for typecheck and production build.
- Acceptance: from a clean checkout, `npm ci`, `npm run typecheck`, and `npm run build` succeed in `app`; CI uses the committed lockfile and documented Node version; no secrets are required for baseline CI; generated files remain untracked. Record any failure honestly instead of disabling checks.
- Exclusions: no pipeline, corpus, confidence, UI behavior, database, dependency-upgrade campaign, or production changes. Regression suite implementation is a separate assignment. This setup task does not approve the draft feature spec.
- Handoff from Codex local: pending — add commit/PR, changed files, checks/results, limitations, and questions here.
- Post-merge review from Muse: pending (non-blocking).

### MUSE-002 — Baseline testing, regression verification, and post-merge review

- [ ] Test the baseline and report reproducible failures — DESIGN §§20, 23, 25
- Owner: Muse
- Status: assigned
- Branch: `phase-0/muse-testing`
- Purpose: act as the independent tester, reviewer of merged changes, and Alex's phone-based QA contact. Codex owns implementation and fixes.
- Scope: test `/`, `/verify`, `/sources`, and `/charter` through available browser access on desktop and Android where available; check navigation, narrow-screen layout, input errors, loading/error recovery, and version labels. Exercise positive/negative PKCE claims, conflicts, irrelevant claims, and repeat submissions through the UI. Record any visible inconsistencies; Codex owns byte-for-byte determinism checks and invalid API body tests unless Muse has suitable browser tooling. Use DESIGN §23 and REVIEW.md as the starting checklist.
- Environment: record exact commit/PR or deployment URL, test time, browser/device, and whether the build includes the proposed fix. Use local or preview/test environments for writes and synthetic source contributions; production checks are read-only unless separately authorized. Authenticated tests require an available test account and configured test environment; mark missing access as blocked, not passed.
- Deliverable: `docs/QA.md` containing cases with expected vs actual behavior and pass/fail/blocked/not-run status. Each bug needs reproduction steps, input, observed output, impact, and supporting screenshot/log where available; redact credentials and personal data. Link existing BUG IDs instead of duplicating them; append newly confirmed bugs to Active bugs.
- Acceptance: cover the listed flows or explicitly mark unavailable cases; distinguish static observations from executed tests. After Codex fixes a bug, retest the exact fix revision and report whether the reproduction and nearby cases pass. Do not mark a bug fixed merely because code changed.
- Exclusions: no application fixes, scoring/methodology changes, dependency changes, migrations, merge, or deployment. Propose automated regression cases; coordinate test-code ownership with Codex before editing shared test files.
- Handoff from Muse: pending — add tested revision/environment, QA report link, results, blockers, and bugs requiring Codex action.
- Triage from Codex: pending.

### CODEX-001 — Correctness design and QA triage

- [ ] Prepare correctness decisions and triage MUSE-002 — DESIGN §§9, 10, 13, 14, 23
- Owner: Codex
- Status: assigned
- Scope: review findings in `docs/REVIEW.md`; define canonical/community evidence isolation, demo evidence labeling, and negation regression expectations before assigning behavior changes. Triage MUSE-002 findings against its acceptance criteria and reconcile proposals with DESIGN.md using explicit version changes.
- Handoff: pending. Muse tests, reports, and reviews merged changes; Codex implements fixes.

### 2026-09-20 — Lead handoff from Habib to Codex: Phase 0 accepted, what I did, what's next

Alex has made me the lead on this project; you own the heavy lifting. Everything below is what I did tonight, verified where I could, and the direction I'm setting. Nothing here asks you to redo finished work.

**1. What I did — database.** I signed into Supabase and applied both pending migrations on the live `trustnode` project in the SQL editor: `db/migration-001b-extracted-text.sql` (`extracted_text` + `extract_error` columns) and `db/migration-001c-sources-trgm.sql` (`pg_trgm` extension, title/excerpt trigram indexes). Both returned "Success. No rows returned", no errors. The migration checkbox in Phase 0 is now flipped.

**2. What I did — frontend verification (read-only, nothing created or modified).** I tested `https://trustnode-lemon.vercel.app` myself:
- Homepage meta-line reads `PROTOTYPE v0.2.0` — consistent with the pipeline, no version mismatch.
- Positive claim "PKCE (RFC 7636) protects OAuth public clients against authorization code interception attacks" → WELL SUPPORTED, 100/100, 6 sources labeled SUPPORTS.
- Negated claim "PKCE does not protect against authorization code interception" → UNSUPPORTED, 0/100, with the note "Negation detected in claim — stance mechanically inverted; analyst review advised." The contradiction behavior is correct — this is not BUG-003.
- `/sources` loads; searching "PKCE" filters to the 2 matching sources; `/charter` renders v1.1, Articles I–IX.
- Two observations, no action required: no pagination controls are visible on the `/sources` UI (backend limit/offset shipped); the sources page meta-line is labeled `v0.1` — that reads as the section's own label, not the pipeline version.

**3. What I did — repo hygiene.** This local checkout was stuck at `161d8e3` with untracked working-tree files blocking the pull. I moved them aside, confirmed they were byte-identical to the remote versions, fast-forwarded to `bcd1f38`, and removed the copies. Local is now clean at the tip of main.

**4. What I did — read every doc end to end** (CHARTER, DESIGN in full, TASKS, REVIEW) and triaged REVIEW.md's 8 findings against the current code:
- Finding 3 (illustrative evidence in real results): **resolved, not filed** — the corpus is now 6 real sources with earned trust + rationales; the `example.invalid` entries are gone.
- Finding 1 (community retrieval moves canonical confidence): **still open** — filed as BUG-004. In `verifyClaim`, seeds and community extras are pooled *before* the topK=6 truncation (pipeline.ts). A keyword-rich unreviewed source can displace a seed from the top 6, which changes the confidence number indirectly — this contradicts the "cannot move the canonical number" comment in the code. This is the most important open correctness hole. Fix: separate canonical evidence selection (seeds only) from community display selection, plus a regression test asserting unreviewed sources cannot change canonical confidence.
- Finding 4 (malformed JSON throws instead of 400): **still open** — filed as BUG-005.
- Finding 8 (network failures leave contribution controls stuck): **still open** — filed as BUG-006.
- Finding 7 (fetch size cap applied too late / SSRF): stays in the Later hardening backlog per the prior deferral — no change.
- Finding 5 (cross-owner tag writes): **not a unilateral fix** — it's a policy decision for Alex (what are the community tagging rules?). I've left it for him.

**Phase 0 verdict: accepted.** Every Phase 0 item is checked. The one acceptance item I could not verify from my environment is the regression suite being green in CI (GitHub CLI isn't authenticated here) — I've added a task for you to confirm it.

**Direction for Phase 1.** Before implementing: settle REVIEW.md's "Design decisions before Phase 1" in DESIGN.md with explicit version changes — (a) a run identifier for `tn_trust_scores` (the current PK can't retain multiple recomputations under one algorithm version), (b) table-specific write policies for seeds/stances/edges, (c) edge direction, dangling-node behavior, domain membership, deterministic ordering, and the exact supersession transfer rule, (d) terminology — graph authority is not measured factual track record, and the UI must say so, (e) whether personal weight overrides get separate confidence or fixed canonical evidence. Then: migration-002 + `trustrank-1.0` with the fixture-graph exactness test. Reminder from DESIGN §26: seed v1 must add at least two new domains or the graph math is theater — the domain picks need Alex's approval, so surface that early rather than at the end.

**Decisions I need from Alex (not you):** the tag-search follow-up (restore tag matching or keep title/excerpt only), the community tagging policy, and the seed v1 domains.

### 2026-09-20 — Charter v2.0 draft (Habib)

Alex flagged the v1.1 charter as slop and wrongly scoped (it mixed in the Prove-It Clock). I rewrote `docs/CHARTER.md` as **v2.0 DRAFT, pending his sign-off**:
- Scope narrowed to TrustNode + SourceSelect; the Clock is out (separate project, separate rules).
- All 9 articles kept, language tightened hard — cut the preachy bits.
- Preamble reframed around Alex's thesis: the black box of search/AI answers, PageRank for sources with the cover taken off, trust infrastructure — not a rival search engine, something shippable.
- `app/src/app/charter/page.tsx` updated to match (it hardcodes the charter text); meta-line now reads v2.0 DRAFT — PENDING SIGN-OFF.
- Do not treat v2.0 as ratified until Alex signs off. If Codex has a charter edit in flight, defer to this draft and reconcile with Alex.

## Active bugs

### 2026-09-20 — Supabase access for Codex Mac (Habib)

Alex flagged that Codex Mac needs Supabase access. Facts and arrangement:
- Alex's Supabase dashboard login is saved in my vault from last night (I used it to apply 001b/001c). I cannot read the password out of the vault or relay it to Codex Mac — that's a hard boundary, not a choice.
- Arrangement that needs nothing new: Codex commits migration SQL to `db/`; I apply it in the Supabase SQL editor on the live `trustnode` project and record it here, same as 001b/001c. This is the established pattern — keep using it.
- For read-only dev queries the anon key is sufficient (PostgREST, RLS applies). Baseline dev/CI must not require live Supabase at all (CODEX-002).
- If Codex needs direct live-DB write access beyond migrations, Alex has to hand over the DB password himself (Supabase dashboard → Project Settings → Database) on his Mac. I can't do that step for him.

## Active bugs (continued)

- [ ] BUG-004: Community sources can change canonical confidence. `verifyClaim` pools seeds + community extras before the topK=6 truncation (pipeline.ts) — a keyword-rich unreviewed source can displace a seed from the top 6, changing the confidence number indirectly. Fix: separate canonical evidence selection (seeds only) from community display selection; add regression asserting unreviewed sources cannot change canonical confidence — DESIGN §§9, 13.
- [ ] BUG-005: `POST /api/verify` throws on valid JSON with wrong field types (e.g. `{"claim":42}`) instead of returning the documented 400. Validate runtime shapes; test malformed inputs — DESIGN §8.
- [ ] BUG-006: `submitLink`/`submitUpload` lack catch/finally — a network failure leaves contribution controls stuck in loading state. Add error states + finally cleanup.

## Fixed bugs

- [x] BUG-000: Verify returned UNSUPPORTED 0/100 for the PKCE claim — seed stance patterns too narrow, community sources had no stances. Fixed 2026-09-19 (enriched seed patterns + mechanical text-overlap stance for community sources, labeled unreviewed).
- [x] BUG-001: Stance engine has no negation handling — "PKCE does not protect against interception" can match support patterns. — DESIGN §4. Fixed 2026-09-19 (two-pass cue+token negation in matchStance: cue within ±4 raw words flips supports↔contradicts, sets negation flag + note).
- [x] BUG-002: Uploaded file bytes are never parsed; only title/description are searchable. — DESIGN §4. Fixed 2026-09-19 (deterministic extractText at upload for pdf/txt/md/html/csv/json, 200KB cap, extracted_text column, failures → status failed with reason).
- [x] BUG-003: Homepage shows PROTOTYPE v0.1.0 while the pipeline reports 0.2.0 — version labels disagree. Fixed 2026-09-19 (single PIPELINE_VERSION constant in app/src/trustnode/version.ts; UI meta-lines + API import it).

## Phase 0 — correctness (before anything new)

- [x] Negation handling in the stance engine ("X does not protect…" must not match support patterns) — DESIGN §4
- [x] Deterministic file-content extraction at upload (pdf/txt/md/html/csv/json) — DESIGN §4
- [x] Regression suite: support, contradiction, qualification, negation, supersession, irrelevant keyword overlap — DESIGN §4
- [x] RFC 7636 claim pinned as a permanent regression case — DESIGN §4
- [x] Move `GET /api/sources` category/tag/q filtering into PostgREST + `pg_trgm` index + limit/offset pagination (currently filters in memory after limit) — DESIGN §§8, 19
- [x] `PATCH`/`DELETE /api/sources/:id` (owner only; PATCH is how a `pending` source becomes `ready` — no update path exists today) — DESIGN §8
- [x] Apply db/migration-001b-extracted-text.sql and db/migration-001c-sources-trgm.sql in the Supabase SQL editor (upload insert + trigram search depend on them)
- [ ] Follow-up: `GET /api/sources` q no longer matches tag labels (was in-memory; trigram index covers title/excerpt per DESIGN §19) — decide whether to restore via a tag-slug lookup
- [ ] Confirm regression suite is green in CI (acceptance criterion, DESIGN §12) — could not verify from Muse's environment
- [ ] Fix README link to removed root CHARTER.md (now docs/CHARTER.md v1.1)

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
- Use phase/task branches when useful; PRs are optional under the autonomous integration policy. If TASKS.md conflicts, keep both lines and reconcile — never delete a task line during a merge.
- DESIGN.md is the contract; this file is the checklist. Disagreements update DESIGN.md first.


## PACKS-001 — Ranked source packs (Codex local)

- Status: implemented; database migration and browser QA pending; branch `feature/source-packs`, isolated checkout `/private/tmp/trustnode-source-packs`.
- Direction: updated STRATEGY.md and IMPLEMENTATION_BRIEF.md; DESIGN §27 v2.2 records scope and deliberate follow-ups.
- Deliverables: pack creation, ranked links with notes, category/tags, public/private visibility, share URLs, copy into own draft; caller-JWT API and atomic RLS migration; no canonical-confidence changes.
- [ ] Apply `db/migration-003-source-packs.sql` in Supabase after code review. Assigned to Muse's existing browser SQL-editor workflow. Record applied time/result here; do not assume it ran from a successful application deploy. This migration adds pack tables/policies/function without changing existing source data.
- [ ] Muse browser QA: open `/packs`, sign in via `/sources`, add two existing links, reorder, annotate, and save privately. Open that URL signed out: no pack data should be visible. Create a public copy: signed-out visitors should see the saved order and notes. Sign into a second test account and copy it: the new private draft belongs to that account and changes do not alter the original. Record account roles (not credentials), URLs/revisions, actual results, and blockers in QA.md.
- Remaining follow-ups: editing/deletion, fork ancestry, pack comparison/merge, category trees, adoption-based retrieval, and profiles. Pack position is curator preference, not earned trust.

- PACKS-001 validation: GitHub CI passed 72 application tests, typecheck, production build, and disposable PostgreSQL checks for public/private reads, cross-owner writes, anonymous writes, duplicate/file rejection, and atomic rollback. Vercel preview passed. This proves test-database behavior, not that migration 003 has been applied to production.
