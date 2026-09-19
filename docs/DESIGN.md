# TrustNode Source Commons — Design Spec

Version 2.0 (DRAFT) — 2026-09-19
Status: **No build work until this spec is signed off.** This is the contract Codex and Habib build from.
Working task + bug tracker: `docs/TASKS.md` (every task references a section here).

## 1. Thesis

Search engines rank without showing why. AI answers without showing sources. TrustNode is the trust layer between generative AI and reality: take a claim, get its sources, supporting evidence, contradictions, and provenance — with every number showing its derivation.

The core thesis (Charter Art. IX): **trust is a property of the graph, not a label anyone assigns.** A source is trusted when trusted sources corroborate it, its claims verify against evidence, and people rely on it — the PageRank/TrustRank playbook, run in the open: public seed set, public algorithm, inspectable weights, reproducible rankings. Seeds are starting points, not thrones.

Product split (settled): **TrustNode** = trust graph + deterministic verification engine (the commons). **SourceSelect** = the glass cockpit (the product). This spec covers TrustNode only.

Lead differentiator: **conflict detection**, not citation display. "Two sources disagree — here's both, here's which is fresher and better-evidenced."

## 2. System inventory (what exists, file by file)

```
app/src/trustnode/pipeline.ts      deterministic pipeline (265 lines)
app/src/app/api/verify/route.ts    POST /api/verify (94 lines)
app/src/app/api/sources/route.ts   GET/POST /api/sources (260 lines)
app/src/app/api/sources/upload/route.ts  POST /api/sources/upload
app/src/app/verify/page.tsx        /verify UI (154 lines)
app/src/app/sources/page.tsx       /sources UI (260 lines)
app/src/app/charter/page.tsx       /charter UI (64 lines)
app/src/app/page.tsx               home
app/src/lib/supabase.ts            Supabase clients, RLS-via-JWT (49 lines)
app/data/sources.json              6-seed OAuth/PKCE corpus (bundled at build)
db/migration-001-sources.sql       Supabase schema + RLS + seed categories
```

Live: https://trustnode-lemon.vercel.app · Repo: https://github.com/AlexBorsody/trustnode · Supabase: `trustnode` project, US East, free tier.

What works: `/sources` (magic-link auth, link contribution, file upload, categories, tags, search/filter, public shelf, status/kind badges); `GET/POST /api/sources`, `POST /api/sources/upload`; `/verify` pipeline 0.2.0 accepting ready community sources (labeled, zero earned trust, cannot move confidence); Supabase tables + RLS + public `source-files` bucket; Charter v1.1.

What doesn't: negation handling (BUG-001); file bytes never parsed (BUG-002); version labels disagree UI v0.1.0 vs pipeline 0.2.0 (BUG-003); seed corpus is a 6-doc OAuth/PKCE prototype, some entries illustrative; no voting, ranking, moderation, verified users, audit history.

## 3. Goals, non-goals, constraints

**Goals:** transparent source graph; conflict detection as the lead feature; deterministic, inspectable verification; a community layer that cannot corrupt canonical trust.

**Non-goals:** RAG tuning (SourceSelect's secondary knobs); social features; semantic search as a scoring input; anything letting votes silently move canonical confidence.

**Constraints (Charter as engineering requirements):**
- Art. I — every confidence value ships with its derivation string, never a bare number.
- Art. II — methodology, data, code public, versioned, forkable. `/api/verify` is intentionally CORS-open.
- Art. III — no paid placement, no sponsored ranking, ever. No code path may accept money for rank.
- Art. IV — influence is a liability: append-only history, versioned methodology, no per-project tuning.
- Art. V — community votes are displayed signals, never silently merged into scores.
- Art. VI — AI explains, never decides. No model touches the numbers. LLM may extract claims upstream later; the pipeline stays deterministic.
- Art. IX — trust computed in the open: public versioned seed set, public algorithm, inspectable weights.

**Technical constraints:** no service-role key in the app (RLS via caller JWT only); Supabase free tier (mind row/egress limits); Vercel serverless (10s fetch timeouts, no long workers — extraction must fit in a route or move async later).

## 4. Feature scope (phased)

- **Phase 0 — correctness (before anything new):** negation handling (§14); deterministic file-content extraction at upload for pdf/txt/md/html/csv/json (§18); regression suite covering support, contradiction, qualification, negation, supersession, irrelevant keyword overlap (§23); RFC 7636 claim pinned as a permanent regression case.
- **Phase 1 — trust graph v1:** `tn_source_edges`, `tn_seeds` (+ `tn_seed_stances`), `tn_trust_scores` (§7); PageRank/TrustRank-style computation with inspectable weights (§16); public endpoints `GET /api/graph`, `GET /api/seeds`, `GET /api/trust/:id` (§8); seeds migrate from `sources.json` into the DB (build-time bundle becomes a versioned DB row set).
- **Phase 2 — granular trust UI (secondary, deferred):** SourceSelect-style knobs menu exposing seed weights, thresholds, stance patterns, conflict rules — public read-only, restricted edits (§6).
- **Phase 3 — community layer, LAST:** verified users, labeled votes, ranking, moderation queue, audit history (§22). Votes stay labeled and never merge into canonical confidence (§9).

## 5. Architecture

Next.js (App Router) on Vercel + Supabase (Postgres + Auth + Storage). No custom backend server, no background workers in v1.

**Request flows:**
- Verify: `POST /api/verify {claim}` → load seeds (static JSON) + up to 200 `ready` community rows from Supabase → `verifyClaim(claim, 6, extra)` → JSON `Verification`. Pure function; no auth; CORS `*`.
- Contribute link: browser magic-link session → `POST /api/sources` with `Authorization: Bearer <jwt>` → route validates URL, dedupes (409), server-fetches page meta (10s timeout, 600KB cap), inserts row as caller's user via RLS → 201 `{id, status}`.
- Upload: multipart `POST /api/sources/upload` (25MB cap, MIME allowlist) → storage `source-files/{userId}/{uuid}-{name}` → row insert → on failure, storage object rolled back.
- Shelf read: `GET /api/sources?limit&category&tag&q` → public read via anon key.

**Data flow principle:** writes always ride the caller's JWT; the server never bypasses RLS. Reads are public. The pipeline itself is a pure function of (claim, corpus) — same inputs, same output, forever.

## 6. UI: the granular menu (secondary feature — deferred)

The "granular UI" = the SourceSelect-style knobs: fine-grained tuning controls exposed as a menu. It is a secondary feature, not core TrustNode work. The trust engine (graph + verification + conflict detection) comes first.

When built, it's an additive menu/page exposing the granular controls (seed weights, thresholds, stance patterns, conflict rules) — public read-only, edits restricted to maintainers. Deferred until Phases 0–1 are done.

## 7. Data model

**Existing** (`db/migration-001-sources.sql`): `tn_categories` (slug unique, name); `tn_sources` (id, owner_id→auth.users, kind file|link, title, url, file_path, file_name, mime_type, category_id, status pending|ready|failed, excerpt, created_at); `tn_tags` (slug unique, label); `tn_source_tags` (source_id, tag_id). RLS: public SELECT everywhere; authenticated INSERT; owner UPDATE/DELETE on sources; storage bucket `source-files` public read, authenticated upload, owner delete. Seven seed categories.

**Proposed (Phase 1)** — new migration `db/migration-002-graph.sql`:
- `tn_sources` gains `origin` ('seed'|'community', default 'community') and `extracted_text text` (Phase 0, §18). The 6 JSON seeds are imported as `origin='seed'` rows so the corpus lives in one place.
- `tn_seed_stances` (id, source_id→tn_sources, claim_pattern text[], stance supports|contradicts|qualifies, quote text, note text nullable) — replaces the JSON `stances` arrays.
- `tn_source_edges` (id, from_id→tn_sources, to_id→tn_sources, edge_type corroborates|cites|supersedes|contradicts, weight numeric 0..1, rationale text, created_by→auth.users, created_at). Unique (from_id, to_id, edge_type).
- `tn_seeds` (id, source_id→tn_sources, version int, added_by→auth.users, rationale text, created_at). Seed set is versioned: bumping `version` publishes a new set; old versions stay queryable.
- `tn_seed_challenges` (id, seed_id→tn_seeds, challenger→auth.users, rationale text, status open|upheld|dismissed, resolved_by→auth.users, resolved_at). Disputes are rows, not edits.
- `tn_trust_scores` (source_id→tn_sources, domain text, earned numeric, algorithm_version text, derivation text, computed_at) — PK (source_id, domain, algorithm_version). Append-only per algorithm version: recomputation writes new rows, never updates.
- RLS mirrors existing: public read; authenticated insert; owner/moderator update. `tn_trust_scores` insert restricted to a maintainer role (Phase 1: Alex's user id allowlisted; Phase 3: moderator role).

## 8. API

**Existing contracts:**
- `POST /api/verify` — body `{claim: string≤500}` → `200 Verification` (§13 for shape) | `400` bad body/empty/too long. CORS `*`. No auth.
- `GET /api/sources?limit≤100&category&tag&q` — `200 {sources:[…]}` | `503` unconfigured. **Known flaw:** category/tag/q filter in memory *after* `limit` — move into the PostgREST query (Phase 0) and add `pg_trgm` index for `q`.
- `POST /api/sources` — auth required. Body `{url, title?, category?, tags?, description?}` → `201 {id, status}` | `400` invalid URL | `401` unsigned | `409` duplicate (returns existing id). Server fetches page meta best-effort; status `ready` iff excerpt present else `pending`.
- `POST /api/sources/upload` — auth required, multipart (file, title?, category?, tags?, description?) → `201 {id, status}` | `400` no file/bad MIME/too large | `401` | `500` (storage rolled back on row-insert failure).

**Proposed (Phase 0):**
- `PATCH /api/sources/:id` — owner only: update title, description/excerpt, category, tags. This is how a `pending` source becomes `ready`. (Gap in v0: no update path exists.)
- `DELETE /api/sources/:id` — owner only; removes row + storage object (RLS already permits it; no API exists).

**Proposed (Phase 1):**
- `GET /api/graph?domain=` → `{nodes:[{id,title,origin,earned,url}], edges:[{from,to,type,weight}], algorithm_version}` — public.
- `GET /api/seeds?version=` → `{version, seeds:[{source_id,title,url,rationale,stances:[…], challenges:[…]}]}` — public. Default = latest version.
- `GET /api/trust/:id?domain=` → `{source_id, domain, earned, algorithm_version, computed_at, derivation}` — public, "show the working" per Art. I.
- `POST /api/verify` gains optional `{trust_overrides?: {allow?: string[], block?: string[], weights?: Record<string, number>}}` — personal trust (§9): `allow` restricts retrieval to listed ids, `block` excludes ids, `weights` multiply retrieval overlap scores (never confidence). The response labels which overrides were active.
- Phase 1 also retires the static `sources.json` import: the verify route loads seeds from `tn_sources WHERE origin='seed'` + `tn_seed_stances`, and the community-extras query excludes `origin='seed'` rows so seeds are never double-counted. `sources.json` remains as the auditable v0 export and test fixture.

## 9. Trust rules (settled — don't relitigate)

- **Earned trust:** measured track record only. v0: analyst-seeded 0–10. v1: computed from the source graph (§16), stamped with algorithm version. Never purchasable (Art. III).
- **Community trust:** labeled votes, visible per source, **never silently merged into canonical confidence** (Art. V). Separate table, separate display.
- **Personal trust:** the user's own hierarchy — allowlist/blocklist/weight overrides, per-domain. The user is the final arbiter of their own queries.
- Trust is **per-domain**: strength in one domain says nothing about another.
- Seeds are starting points — public, versioned, disputable — never permanent authorities (Art. IX).

## 10. How Codex and Habib work together

- This spec is the contract. Disagreements → update the spec first, then code. Spec version bumps are explicit, never silent (Charter Art. IV).
- One branch per phase (`phase-0/negation`, `phase-1/graph`, …); PRs against `main`.
- PR checklist: `npx tsc --noEmit` green; regression suite green; TASKS.md checkbox flipped in the same PR; no secrets/keys in code or logs; Charter articles cited where behavior touches them.
- Determinism is non-negotiable: any new pipeline logic must be a pure function with fixture tests. If it needs randomness or a model, it doesn't go in the pipeline.
- Merge conflicts on `docs/TASKS.md`: keep both lines, reconcile, never delete a task line in a merge.

## 11. Open questions

1. ~~Granular UI menu~~ — resolved 2026-09-19: SourceSelect-style knobs; secondary, deferred (§6).
2. File extraction: in-route at upload time (fits 25MB/Vercel limits?) or async worker later? Default: in-route with strict caps; revisit if timeouts appear.
3. Seed set v1: which sources beyond the 6 prototypes, and who approves additions? Proposal: Alex approves v1; challenge process opens in Phase 3.
4. Personal-trust overrides on `/api/verify`: query params vs body? Default: body, labeled in response.
5. Should `GET /api/sources` filtering move fully into PostgREST in Phase 0, or wait for Phase 1? Default: Phase 0 — it's a correctness-adjacent perf bug.

## 12. Acceptance

- Spec accepted when Alex signs off on §§4, 6, 9, 10. Then Phase 0 starts.
- Phase 0 accepted when: BUG-001/002/003 closed, regression suite green in CI, RFC 7636 case pinned.
- Phase 1 accepted when: graph endpoints live, seed v1 published with rationale, every trust score carries algorithm version + derivation, recomputation reproduces scores exactly.
- Phase 2 accepted when: knobs menu exposes all granular controls read-public, edits restricted, every control change is labeled in verify output.
- Phase 3 accepted when: votes visibly labeled and provably isolated from confidence (test: vote-stuffing changes no confidence value), moderation queue + audit history live.

## 13. Verification pipeline spec (deterministic)

`verifyClaim(rawClaim, topK=6, extra=[]) → Verification`. Pure function. Same inputs → same output, byte-identical.

1. **Normalize:** trim; tokenize — lowercase, strip `[^a-z0-9\s-]`, split whitespace; for hyphenated tokens keep both joined and split forms; naive stem (ies→y, (s|x|z|ch|sh)es→−es, trailing s→drop unless ss); drop stop-words and tokens of length ≤1. `normalized` = tokens joined by space.
2. **Retrieve:** corpus = seeds + `extra` (ready community rows, mapped with `communityTextStance`, earned 0). Haystack per source = tokens(title + keywords + text) + tokens(all stance patterns). Score = distinct token overlap count with claim tokens. Keep score > 0, sort desc, take topK (default 6).
3. **Stance:** per retrieved source, `matchStance` — for each stance, hits = distinct pattern tokens present in claim tokens; `need = min(2, claim_pattern.length)`; stance matches if hits ≥ need; winner = most hits. No match → `unrelated` with `match_explain` naming the retrieval keywords.
4. **Conflicts:** if ≥1 supporting and ≥1 contradicting → `contradiction` conflict naming both source ids, detail framed by the highest-earned source ("read both quotes before deciding"). Any relied-upon (stance ≠ unrelated) source with freshness ≠ current → `outdated` conflict with its freshness detail.
5. **Freshness:** `superseded_by` set → `superseded` (+ detail); else `current`. Standards never expire by age — only by supersession.
6. **Confidence:** `support = min(1, Σ(earned/10 of supporters)/2)`; `contra = min(1, Σ(earned/10 of contradictors)/2)`; `stale = 0.2` if any relied-upon source isn't current else 0; `value = round(100 × clamp(support × (1 − 0.6×contra) − stale, 0, 1))`. Levels: ≥80 well supported · ≥50 partially supported · ≥20 contested · else unsupported. `derivation` string always emitted, naming the formula values and citing Arts. V and IX.
7. **Response shape:** `{claim, normalized, pipeline_version, sources:[{id, origin seed|community, title, url, publisher, freshness, freshness_detail, trust:{earned, earned_rationale, community, community_votes}, stance, quote, stance_note, match_explain, negation?: boolean}], conflicts:[{type, sources, detail}], confidence:{value, level, derivation}, note}`.

Edge cases (specced, not accidental): empty claim → 400; claim >500 chars → 400; no retrieval hits → `sources: []`, confidence 0, level `unsupported`; Supabase down → community extras silently empty, seeds still verify (best-effort shelf).

## 14. Stance engine spec

**Seed stances** (Phase 0: `sources.json`; Phase 1: `tn_seed_stances`): each stance = `{claim_pattern: string[] (phrases), stance: supports|contradicts|qualifies, quote, note?}`. Matching is token-overlap as in §13.3. Patterns must be written to cover purpose, mechanism, scope, recommendation, and deprecation facets of the source (the 2026-09-19 lesson: narrow patterns caused the 0/100 miss).

**Negation handling (BUG-001)** — deterministic, no model. Two-pass design (one pass is not enough: stemming and stop-word removal destroy contractions — "doesn't" becomes "doesn"+"t" — so cues must be caught before normalization):
1. *Cue pass* on the raw lowercased claim, word-boundary regex: `not|no|never|without|cannot|fail(s|ed)?|don't|doesn't|does not|isn't|aren't|can't|won't|couldn't`. Record each cue's word index in the raw word array.
2. *Token pass* exactly as §13.1, except the tokenizer additionally records each surviving token's raw word index (parallel array — small, deterministic change to `tokens()`).
3. *Rule:* a matched pattern keyword (normalized token with raw word index `wi`) counts as negated if any cue's word index is within ±4 of `wi`. If any matched keyword of the winning stance is negated → flip `supports↔contradicts` (leave `qualifies`), set `negation: true` on the source result, `stance_note = "Negation detected in claim — stance mechanically inverted; analyst review advised."` Retrieval ranking and confidence math are unchanged.
- Regression cases: "PKCE protects OAuth public clients against interception" (supports) vs "PKCE does not protect against interception" (inverted) must produce opposite stances on the same sources.

**Known looseness (reviewed, kept):** `need = min(2, claim_pattern.length)` counts *phrases*, not tokens — a single-phrase pattern matches on one token hit. This is the shipped behavior; the regression suite guards it. Tightening it is a behavior change for Alex, not a drive-by fix.

**Community stances** (`communityTextStance`): mechanical only — top ≤14 distinct title+text tokens (len>2, ≥2 required) as a `supports` pattern; quote = first 280 chars of text or title; mandatory note: unreviewed, keyword-overlap only, zero earned trust, cannot move confidence. A community source NEVER gets an analyst stance without review.

## 15. Conflict detection spec

The lead differentiator. Two conflict types in v0, both surfaced above the evidence chain in UI:
- `contradiction`: sources on both sides. Detail always frames via the highest-earned-trust participant and instructs the reader to read both quotes. Never auto-resolves — the engine presents, the human decides (Art. VI).
- `outdated`: relied-upon source is `superseded` (or later: `stale`). Detail carries the freshness detail string.

Phase 1 additions: edge-driven conflicts — a `contradicts` edge between two relied-upon sources generates a conflict even if stance patterns miss it; a `supersedes` edge auto-marks freshness. Conflict objects gain `edge_ids` provenance.

## 16. Trust computation spec (Phase 1)

**v0 (current):** analyst-seeded `earned` 0–10 in the corpus. Honest about what it is; the product stays labeled prototype until measured.

**v1 (graph-computed):** personalized PageRank over `tn_source_edges` — the honest open version of the TrustRank playbook:
- The current seed set version (`tn_seeds`, latest `version`) is the **teleport vector** (uniform over seeds). This is what "seeds are starting points, not thrones" means mathematically: the algorithm is fixed, but *which sources originate trust* is public, versioned, and disputable. A challenged-and-removed seed loses its teleport mass in the next version.
- Trust flows along `corroborates`/`cites` edges, weighted by `weight`, with damping **d = 0.85** (published constant). `contradicts` edges propagate nothing — they feed conflict detection (§15). `supersedes` transfers the predecessor's accumulated score to the successor, labeled in the derivation.
- Iterate to convergence: cap 100 iterations, tolerance 1e-6 (published constants). Deterministic: same graph + same algorithm version → byte-identical scores. CI asserts this on a fixture graph.
- Per-domain normalization: `earned = round(10 × s / max_s_in_domain, 1)` → 0–10, one decimal.
- Every score row carries `algorithm_version` (e.g. `trustrank-1.0`) and a `derivation` (teleport set version, top contributing paths, weights used). Recomputation writes new rows, never updates.
- **Measured track record (reserved):** future signal = fraction of a source's stances that agreed with eventual consensus on contested claims. Specced as a future input with its own published weight, never silent. v1 ships without it and says so.

**Community votes:** `tn_votes` (Phase 3) — displayed per source, aggregated as sentiment, physically separate from `tn_trust_scores`. The confidence formula never reads them; a test asserts vote-stuffing changes no confidence value.

## 17. Seed governance

- The seed set is published (`GET /api/seeds`), versioned (integer versions, append-only), and disputable: any signed-in user may flag `challenged=true` with a rationale (Phase 1: flag only; Phase 3: full challenge workflow with moderator review).
- Adding a seed requires a rationale naming *why this source is foundational for its domain* and a second pair of eyes (Phase 1: Alex; Phase 3: moderator quorum).
- Seeds are starting points, not thrones: trust that stops being earned stops flowing — a seed with decaying corroboration loses rank automatically under §16.
- Migration: the 6 JSON seeds become `origin='seed'` rows + `tn_seed_stances` rows in migration 002; `sources.json` remains as the versioned export of seed v0.

## 18. Ingestion spec (files + links)

**Links** (`POST /api/sources`): validate http(s); 409 on exact-URL duplicate; server fetch best-effort (10s timeout, 600KB cap, TrustNodeBot UA) for title + ≤4000-char text → `excerpt`; contributor title/description override; `status = ready` iff excerpt present else `pending`. **Security (do before scaling):** SSRF guard — resolve DNS, refuse private/loopback/link-local/metadata ranges; or drop server fetch entirely and rely on contributor text.

**Files** (`POST /api/sources/upload`, BUG-002 fix): after storing bytes, extract text deterministically by MIME — pdf via a pinned parser lib, txt/md as UTF-8, html via tag-stripping (reuse link path), csv as row text, json as extracted string values; cap extracted text at **200KB** (decided); store in `extracted_text` (new column), keep contributor `description` as the display excerpt; `status = ready` iff `extracted_text` or description present. 25MB cap stays. Extraction failures → `status='failed'` with reason (today nothing sets `failed` — wire it).

**Retrieval text** for a source = title + keywords + excerpt + extracted_text (Phase 0: wire `extracted_text` into the verify route's `text` field).

**Deferred (2026-09-19):** upload hardening — magic-byte MIME validation, SSRF guard on link fetch, per-IP rate limiting — moves to the post-Phase-1 backlog (TASKS.md "Later"). Functionality first; the shelf stays small and watched until then.

**Standing principle (2026-09-19):** don't make it insecure, but spend the time building. We're early — mountain to climb, currently a pile of dirt.

## 19. Retrieval spec

**v0 (current):** deterministic keyword overlap (§13.2) over title + keywords + text + stance-pattern tokens. topK=6. No embeddings anywhere near scoring (Art. VI). Honest limits: no synonyms, no semantics — "OAuth" won't match "authorization framework" unless patterns say so. Mitigation is better stance patterns (§14), not a model.

**Performance (Phase 0):** `GET /api/sources` must push category/tag/q into PostgREST instead of filtering in memory after `limit`; add `pg_trgm` GIN index on title/excerpt for `q`; paginate (limit/offset now, cursor later). `/api/verify` caps community extras at 200 rows, newest first — acceptable; revisit with per-domain corpus growth.

**Future (post-v1, specced but not scheduled):** embedding-based retrieval *as a candidate generator only* — candidates still go through the deterministic stance/confidence math, and the response labels which retrieval path surfaced each source. Never silently.

## 20. UI spec

**Pages (existing, keep):** `/` home · `/verify` claim cockpit · `/charter` charter text · `/sources` commons shelf (auth panel, link form, upload form, search/filter shelf).

**Badge taxonomy (do not invent new badges without speccing):** stance (`supports|contradicts|qualifies|unrelated`, color-coded); origin (`community source` tag); freshness (`superseded|stale` tag, only when not current); status (`pending|failed` tag, only when not ready); kind (`file|link`).

**`/verify` contract:** confidence number + level tag + derivation formula block (always visible, never collapsed by default); conflicts panel above evidence chain; per-source: title link, stance badge, origin/freshness tags, quote with stance note, earned/community meters with rationales, `match_explain`, and (Phase 1) `negation: true` flag where applicable.

**`/sources` contract:** magic-link sign-in (redirect back to `/sources`); signed-in users see both contribution forms; shelf cards show kind/status badges, category, tags, date, 280-char excerpt; search + category filter. Empty state: "The shelf is empty. Be the first to shelve a source."

**Version labels (BUG-003):** single source of truth — `app/src/trustnode/version.ts` exporting `PIPELINE_VERSION`; UI meta-lines and API import it. No hardcoded version strings anywhere else.

## 21. Auth & security

- **Auth:** Supabase email magic link; redirect URLs allowlisted (`/sources` + app origin). Session lives in the browser; API calls carry `Authorization: Bearer <jwt>`; server builds a per-request client — RLS enforces ownership, no service-role key exists in the app. Never log tokens.
- **RLS (existing, verified):** public SELECT on all commons tables; authenticated INSERT; owner UPDATE/DELETE on `tn_sources`; tag upsert needs the authenticated UPDATE policy on `tn_tags` (already added). New Phase 1 tables copy this pattern; `tn_trust_scores` INSERT restricted to maintainer allowlist.
- **SSRF (`fetchLinkMeta`):** server fetches arbitrary user-supplied URLs. Deferred to the Later hardening backlog (TASKS.md): DNS-resolve and refuse private/loopback/link-local/cloud-metadata ranges, keep 10s timeout + 600KB cap, or remove server-side fetch (contributor text only).
- **Upload abuse:** validate magic bytes server-side (MIME allowlist is currently client-asserted); 25MB cap; random storage paths; public bucket — serve with `Content-Disposition: attachment` for non-viewable types in Phase 1.
- **Rate limiting:** none currently. Deferred to the Later hardening backlog (TASKS.md): per-IP throttling on POST `/api/sources`, `/api/sources/upload`, `/api/verify`.
- **Secrets:** env vars only (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_*`). Never in code, logs, or the repo.

## 22. Community layer spec (Phase 3 — LAST)

Order matters: this ships only after the core engine is correct and the graph is live.

- **Verified users:** beyond magic-link — verified = completed a verification step (propose: GitHub/OAuth link or manual approval). Unverified users contribute (labeled); only verified users vote or flag.
- **Votes:** `tn_votes` (id, source_id, user_id, value −1|+1, domain?, created_at; unique(user_id, source_id)). Displayed as labeled sentiment per source. **Never read by the confidence formula** — CI asserts vote-stuffing changes no confidence value (Art. V).
- **Ranking:** community-ranked shelf views are separate surfaces ("most relied-upon this week"), clearly labeled as community signal, never the default shelf order.
- **Moderation queue:** `tn_reports` (id, source_id, reporter, reason, status open|upheld|dismissed, resolved_by, resolved_at). Spam/abuse removal by moderators; removals are logged, not silent.
- **Audit history:** append-only `tn_audit` (actor, action, target, before/after, at) for moderation actions, seed changes, and trust-score publications. Anyone can replay what changed and when (Arts. I, IV, VIII).

## 23. Testing strategy

- **Unit:** `tokens()`/stemmer fixtures (hyphens, stop-words, stemming edge cases); `matchStance` (threshold `min(2, pattern.length)`, best-wins); `communityTextStance` (≤14 keywords, ≥2 required, mandatory note); confidence formula (hand-computed fixtures incl. zero-source, all-contradict, stale-penalty cases).
- **Regression (pinned, snapshot):** claim corpus covering support / contradiction / qualification / negation / supersession / irrelevant overlap. The RFC 7636 claim ("PKCE protects OAuth public clients against authorization code interception attacks") is pinned: expected `100/100 well supported` with RFC 7636 + RFC 9700 + Okta supporting. Negation pair must invert. Snapshots store full `Verification` JSON; diffs fail CI.
- **API:** 400/401/409 paths for sources + upload; 503 when unconfigured; CORS headers present on verify.
- **E2E (smoke):** magic-link → shelve link → upload file → both appear in `/api/sources` → claim verifies with community source labeled. (Mirrors the 2026-09-19 manual smoke test; automate with a test Supabase project.)
- **Determinism:** same claim + fixture corpus → byte-identical output, run twice. Trust v1: fixture graph → exact expected scores per algorithm version.

## 24. Observability ("show the working" as infrastructure)

- Every `/api/verify` response already carries `derivation`, `match_explain`, `pipeline_version`, quotes, and trust rationales — this is the product, not logging.
- Add: `request_id` on API responses; server log of (request_id, claim hash — never raw claim text — pipeline_version, ms, source count). Vercel logs suffice for v1.
- Version labels single-sourced (§20, BUG-003). Methodology changes ship as new `pipeline_version`/`algorithm_version` with a changelog entry — never silent (Art. IV).

## 25. Deploy & environments

- **App:** Vercel, `trustnode-lemon.vercel.app` (production). Preview deploys per PR. Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No service-role key anywhere.
- **Data:** Supabase `trustnode` project (US East, free tier). Migrations in `db/` numbered sequentially, each runnable once via SQL editor; every migration recorded in TASKS.md when applied.
- **Auth config:** magic-link redirect URLs must include every Vercel deployment URL pattern in use.
- **Release:** `main` deploys. Phase branches merge via PR with the §10 checklist. Tags for pipeline/algorithm version bumps.

## 26. Risks

1. **Single-domain corpus** — everything is OAuth/PKCE. The engine is unproven elsewhere; Phase 1 seed v1 must add at least two new domains or the graph math is theater.
2. **Keyword retrieval ceiling** — no semantics; mitigated by stance patterns, but a real corpus needs the embedding-candidate path (§19) eventually.
3. **SSRF via link fetch** (§21) — fix before promoting the shelf publicly.
4. **Spam/low-quality contributions** — no moderation until Phase 3; keep the shelf small and watched until then. Community sources can't move confidence, which bounds the damage.
5. **Supabase free-tier limits** — row counts, egress on public bucket; monitor before any launch push.
6. **Founder bottleneck** — seed approvals and moderation currently route through Alex (Art. VIII: design so the commons survives him — versioned data, forkable code, documented process).
