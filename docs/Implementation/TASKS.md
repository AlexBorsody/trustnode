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

- Link contribution, source shelf/search, owner source API operations, file extraction.
- Source packs: ordered links and notes, topics/tags, private/public visibility,
  public sharing, and independent copies (PR #4).
- Owner pack edits/deletion: atomic ordered saves, captured revision checks,
  recoverable drafts, and explicit deletion confirmation. Requires migration 004.
- Attributed forks: captured parent revision, independent copies, immutable origin
  records and visibility-aware attribution. Requires migration 005.
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

1. Activate and verify pack persistence in production. The live read still returned
   503 on 2026-09-21;
   direct Supabase read returned PGRST205 (tn_packs missing from schema cache).
   Apply migrations `003-source-packs`, `004-pack-editing`, and `005-pack-ancestry`
   from `db/` in that order
   through an authorized database session; check applied state before rerunning.
   No authenticated dashboard/DB session is available to this desktop task.
   The local public app credentials cannot run migrations. Migrations
   001b/001c were previously reported applied. Do not infer DB state from deployment.
   After activation: verify private/public reads, owner edits and deletion, two-tab
   stale-save recovery, and second-account ownership isolation in an authorized test account.
2. Add category hierarchy and pack comparison, then evidence graph relationships.

## Latest delivery check — 2026-09-21

Fork ancestry: 32 pack/API checks, typecheck and production build pass. Disposable
PGlite ran migrations 003→004→005 and the SQL suite: public-parent copying across
owners, immutable origins, stale revisions, rollback, private child/parent read
isolation, and parent deletion preserving copies. Existing CI runs the same SQL
on PostgreSQL. Local browser fixtures confirm private-by-default copies, captured
revision, stale-draft preservation/reload, saved attribution and hidden-parent behavior.
No production data or migrations were changed. Live readiness remains item 1.

## Resumption context

Continue in this checkout on `main`; Strategy is locked. Routine commits/pushes
are authorized, with proportional checks. No separate agent owns unfinished work.

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
- The app's charter page still shows the historical v2 draft; reconcile it with
  Alex's retained charter text without inventing a ratification decision.

## Recovery

Pre-cleanup tracked/untracked source files, patches, and all Git refs are saved
locally in `.recovery/2026-09-20-consolidation/` (ignored by Git).
`pending-product-ui.patch` is the original recovery copy of the now-resumed
homepage/error-recovery work; do not reapply it. Archive `README.txt` explains
restoration of older drafts. The named pre-consolidation stash is also retained. Superseded pipeline/file-parser
drafts are preserved there; the already merged implementations remain authoritative.
Historical reviews, QA reports, and old assignments remain available in Git history.
