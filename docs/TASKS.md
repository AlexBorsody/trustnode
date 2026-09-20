# TrustNode Source Commons — Task + Bug Tracker

Working task and bug tracker for `docs/DESIGN.md`. Check items off as they land —
update this file in the same commit/PR that completes a task or fixes a bug, so the tracker stays real-time.
Legend: `- [ ]` open · `- [x]` done/fixed · `- [!]` blocked.

## Codex ↔ Muse handoffs

Alex has designated Codex as project lead and Muse as an implementation collaborator.
This file is the shared assignment and review board. Codex owns prioritization,
architecture, review, and integration; Muse owns explicitly assigned work below.
Existing product decisions in DESIGN.md remain the contract.

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
- Exclusions: no application, dependency, database, or methodology changes; leave MUSE-001 files to Muse. This is a review task, not approval of the draft design.
- Handoff from Codex web: pending.
- Review from Codex local: pending.

### Coordination rules

- Read this board and the latest upstream changes before starting. Claim an assignment by updating its Status and naming the branch before editing implementation files.
- Assignment statuses: `assigned` → `in progress` → `ready for review` → `accepted`; use `blocked` with a concrete reason when necessary. Codex marks acceptance after review; check off the task when it lands.
- Work on a task branch and open a PR against `main`. Keep changes within the assigned files/scope; post a blocker here if another owner's files must change.
- On handoff, record commit/PR, files changed, exact checks and results, remaining limitations, and any decision needed. A claimed passing check must have actually run.
- Update your own assignment block; preserve other assignments and the existing backlog. Keep both sides of tracker conflicts and reconcile them.
- This file does not send notifications or synchronize itself. Publish changes through GitHub so the other collaborator can read them; each collaborator checks it at the start of work and before handoff. Local-only edits are not visible to the other collaborator.
- Do not merge, deploy, change production settings, or apply database migrations as part of an implementation assignment unless explicitly included in its scope.

### MUSE-001 — Reproducible development setup and baseline CI

- [ ] Complete development setup and baseline CI — DESIGN §§10, 23, 25
- Owner: Muse
- Assigned by: Codex, 2026-09-19
- Status: assigned
- Branch: `phase-0/dev-setup` (record actual branch when claimed)
- Purpose: make this GitHub-web-edited project reproducible locally and give every PR a typecheck/build baseline.
- Scope: root `.gitignore`, `.github/workflows/`, README setup instructions, `app/.env.example`, a Node version declaration, and removal of tracked `app/tsconfig.tsbuildinfo`. Change `app/package.json` or its lockfile only if necessary for runtime declarations or setup, and explain why.
- Deliverables: choose and document a Node version compatible with locked dependencies; use `npm ci` from `app`; ignore dependencies, build outputs, local env files (retain the example), and TypeScript build metadata; provide placeholder-only examples for the four Supabase variables in DESIGN §25; document seeded verification without credentials and what requires Supabase; fix the README Charter path/version; add PR CI for typecheck and production build.
- Acceptance: from a clean checkout, `npm ci`, `npm run typecheck`, and `npm run build` succeed in `app`; CI uses the committed lockfile and documented Node version; no secrets are required for baseline CI; generated files remain untracked. Record any failure honestly instead of disabling checks.
- Exclusions: no pipeline, corpus, confidence, UI behavior, database, dependency-upgrade campaign, or production changes. Regression suite implementation is a separate assignment. This setup task does not approve the draft feature spec.
- Handoff from Muse: pending — add commit/PR, changed files, checks/results, limitations, and questions here.
- Review from Codex: pending.

### CODEX-001 — Correctness design and Muse integration review

- [ ] Prepare correctness decisions and review MUSE-001 — DESIGN §§9, 10, 13, 14, 23
- Owner: Codex
- Status: assigned
- Scope: review findings in `docs/REVIEW.md`; define canonical/community evidence isolation, demo evidence labeling, and negation regression expectations before assigning behavior changes. Review MUSE-001 against its acceptance criteria and reconcile proposals with DESIGN.md using explicit version changes.
- Handoff: pending. No verification implementation files are assigned to Muse yet.

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
