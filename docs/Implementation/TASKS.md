# Current work

Product direction: [STRATEGY](../Business/STRATEGY.md).
Technical contracts: [DESIGN](DESIGN.md). Updated 2026-09-20.

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
- Explorer and retrieval API with visible ranking factors and pack scope (PR #5).
- Canonical verification isolated from community ranking; pipeline 0.3.0.
- Node setup, API input validation, existing regression checks and CI.

These are implementation milestones, not a claim that every production flow works.

## Workspace status

Consolidated onto `main`; documentation conflicts resolved. Strategy is canonical.
Redundant docs and historical assignments are removed from the active tree;
old work is preserved in Git history and the local recovery archive.
Product changes are paused at Alex's request until organization is complete.

## Next

1. Resume the preserved UI improvements when Alex is ready: make the existing workflow discoverable from the homepage and fix source-form
   error recovery (BUG-006) and empty-claim feedback (BUG-007).
2. Verify pack persistence in production. The last recorded read returned 503;
   migration `db/migration-003-source-packs.sql` activation is unconfirmed. Migrations
   001b/001c were previously reported applied. Do not infer DB state from deployment.
3. Complete owner pack editing/deletion and attributable fork ancestry.
4. Add category hierarchy and pack comparison, then evidence graph relationships.

## Remaining limits and decisions

- Canonical evidence is still a seeded OAuth/PKCE demo with illustrative fixtures;
  source quotation/provenance cleanup and broader domain coverage remain unfinished.
- Shelf search does not match tag labels; UI pagination is absent.
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
`pending-product-ui.patch` contains the paused homepage/error-recovery work;
it passed typecheck but is not applied or shipped. Archive `README.txt` explains
restoration. The named pre-consolidation stash is also retained. Superseded pipeline/file-parser
drafts are preserved there; the already merged implementations remain authoritative.
Historical reviews, QA reports, and old assignments remain available in Git history.
