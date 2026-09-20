# Project handoff review — 2026-09-19

Reviewed at commit `161d8e3`. This is a repository review, not a production audit or spec approval. Read README, Charter, Design, Tasks, application source, corpus, and migration 001. No application behavior changed.

## Direction

TrustNode owns the public trust graph and deterministic verification engine. SourceSelect owns the configurable interface. Conflict detection and inspectable evidence are the central product. Keep community sentiment separate from canonical confidence, preserve reproducibility, and complete correctness work before graph expansion. The existing Next.js/Supabase architecture is small enough to continue without a rewrite.

## Findings, in priority order

1. **High — community retrieval can change canonical confidence.** `app/src/trustnode/pipeline.ts:159–175` pools seeds and community sources before truncating to six results. Zero earned trust prevents direct weight, but keyword-rich community contributions can displace scoring seeds. Confidence is then calculated only from the surviving results. Define separate canonical evidence selection and community display selection; add a regression asserting that adding unreviewed sources cannot change canonical confidence. This requires reconciling DESIGN §§9, 13 and the stated isolation promise.

2. **High — negation is ignored (BUG-001).** `matchStance` matches shared tokens without their polarity. Positive and negative claims can receive the same supporting evidence. The proposed ±4-word inversion needs fixtures for already-negative patterns, “not only,” and multi-clause claims; blindly flipping every nearby match can introduce new errors. Determinism is necessary but does not establish semantic correctness.

3. **High — illustrative evidence participates in real-looking results.** `app/data/sources.json` includes two `example.invalid` sources with nonzero earned trust. Its header describes sample community votes, but `app/src/app/verify/page.tsx` renders those as vote totals without a sample label. These fixtures can change confidence and conflicts. Separate demo fixtures from canonical evidence, label sample data at the point of display, and audit seed quotes against original documents before claiming exact quotations. External quote accuracy was not checked in this review.

4. **Medium — valid JSON with invalid field types throws.** `app/src/app/api/verify/route.ts:30` assumes `body` is non-null and `claim` is a string. Bodies such as `null` or `{"claim":42}` throw instead of returning the documented 400. The link route similarly assumes string fields; multipart metadata uses unchecked casts. Validate runtime shapes and test malformed inputs.

5. **Medium — cross-owner tag writes are permitted by the checked-in policy.** Migration 001 allows every authenticated user to insert any `tn_source_tags` association, regardless of source ownership. An API caller can use Supabase directly to attach tags to another contributor's source. Decide the intended community tagging policy explicitly; if owner-only, enforce ownership in RLS. Shared tag labels are also editable by every authenticated user. Live database policies were not inspected.

6. **Medium — known ingestion and shelf gaps remain.** File bytes are stored but never parsed (BUG-002). Shelf filters run after the limit, so matching older sources can disappear. No owner edit/delete routes exist. These are already tracked in Phase 0.

7. **Medium — fetch size cap is applied too late.** `fetchLinkMeta` reads the entire response into memory before checking the 600KB limit. It is not a bounded download. Arbitrary HTTP(S) destinations and redirects also remain allowed, matching the documented deferred SSRF issue. Preserve the existing hardening backlog, but resolve these before broader public use.

8. **Medium — network failures can leave contribution controls stuck.** `submitLink` and `submitUpload` lack catch/finally; a rejected fetch skips `setLoading(false)`. Shelf fetch errors are not shown, and concurrent searches can render older responses last. Add explicit error states, finally cleanup, and stale-request cancellation/ordering.

## Design decisions to settle before Phase 1

- **History:** the proposed score primary key `(source_id, domain, algorithm_version)` cannot retain multiple recomputations with the same algorithm. Introduce an immutable computation/run identifier and pin graph snapshot, seed version, domain, and algorithm inputs. Version the graph inputs as well as the code.
- **Graph authority:** DESIGN §7 proposes authenticated insertion for graph tables, while §17 requires seed approval. Define table-specific write policies for seeds, stances, and edges. Unreviewed community-created edges must not become an indirect mechanism to control canonical trust.
- **Algorithm completeness:** specify edge direction, dangling-node behavior, domain membership, deterministic ordering, and the exact supersession transfer rule before implementing the fixture expectations.
- **Terminology:** graph authority is not yet measured factual track record. The design acknowledges the distinction; the UI should too.
- **Personal weights:** multiplying retrieval weights can change the evidence selected and therefore confidence indirectly. State whether personalized results have separate confidence or keep canonical evidence fixed.

## Delivery order

1. Establish Node/npm locally, a reproducible build, regression fixtures, and CI.
2. Resolve canonical/community isolation and seed/demo provenance; implement negation with scoped regression cases and a versioned methodology change.
3. Complete extraction, input validation, shelf filtering/pagination, owner operations, and version labels.
4. Finalize graph schema, governance, and reproducibility details; then implement Phase 1.
5. Retain the documented deferral of granular UI and community features.

Keep phase branches, PRs, and TASKS.md updates together. Account for concurrent GitHub web edits by reviewing upstream changes before implementation and merge.

## Validation and handoff gaps

- `npm ci --no-audit --no-fund` could not start: `npm` is not available on the shell PATH. No build, typecheck, or executable regression results are claimed.
- No test script, test suite, or CI workflow is checked in. No local Supabase environment file is present; authenticated flows and deployed database state remain unverified.
- README links to removed root `CHARTER.md` and calls it v1.0; the current charter is `docs/CHARTER.md` v1.1.
- UI/footer and pipeline versions disagree (BUG-003).
- No `.gitignore`, environment template, or license file is checked in; `app/tsconfig.tsbuildinfo` is tracked. Add development setup guidance and choose an explicit license to support the charter's reuse intent.
- DESIGN v2.0 is still marked DRAFT with explicit sign-off in §12. This review does not silently amend that status or change settled product rules.
