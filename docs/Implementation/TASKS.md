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
   Apply `db/migration-003-source-packs.sql`, then `db/migration-004-pack-editing.sql`
   through an authorized database session; check applied state before rerunning.
   No authenticated dashboard/DB session is available to this desktop task.
   The local public app credentials cannot run migrations. Migrations
   001b/001c were previously reported applied. Do not infer DB state from deployment.
   After activation: verify private/public reads, owner edits and deletion, two-tab
   stale-save recovery, and second-account ownership isolation in an authorized test account.
2. Add attributable fork ancestry to the existing independent-copy flow.
3. Add category hierarchy and pack comparison, then evidence graph relationships.

## Latest delivery check

2026-09-21: 132 application checks, typecheck, and production build pass. Migration
003→004 and the existing SQL suite pass in disposable PGlite, including owner RLS,
atomic rollback, revision conflicts, visibility changes, and source/copy preservation.
Local browser with disposable auth/API fixtures confirms edit/reorder/note/visibility
saves at the same URL, stale-draft preservation, failed-save retry, delete cancellation
and completion, and narrow-screen layout. This does not establish live Supabase behavior.
No production data was written; pack activation and authenticated production QA remain open.

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
