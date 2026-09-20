# TrustNode Implementation Brief

## Execution status — 2026-09-20

Strategy is locked. This brief is the implementation plan and delivery record; changes below refine contracts and sequencing, not product direction.

- [x] Link contribution, searchable source shelf, signed-in ownership operations.
- [x] Source-pack creation, explicit order/notes, topic/tags, public/private access, sharing, and independent copies (PR #4).
- [ ] Confirm migration 003 applied in production and complete Muse's authenticated pack QA. Code deployment alone does not complete this item.
- [x] Implement initial transparent retrieval ranking and an Explorer workflow (current delivery; final validation below).
- [x] Isolate canonical verification from community retrieval and session controls (BUG-004; pipeline 0.3.0).
- [ ] Pack editing/deletion and explicit fork ancestry; category trees and pack comparison/merge.
- [ ] Evidence graph edges and recorded corroboration/directness inputs; measured historical reliability.
- [ ] Downstream summarization controls when a summarizer exists. Do not expose temperature/top-p controls before they have an effect.

Current delivery: `/explore`, `POST /api/retrieve`, and the “Explore these sources” action on a pack. The session controls are source scope, result count, and public pack influence. Canonical evidence remains independently inspectable with its derivation and conflicts.

### Retrieval v1 contract

Request: `{query: string (1–500), limit?: integer (1–20, default 6), use_pack_signals?: boolean (default true), pack_id?: uuid}`. Invalid inputs return 400; an inaccessible selected pack returns generic 404, an invalid token for private selection returns 401, and unavailable selected-pack storage returns 503. Public corpus exploration remains usable if the optional database layers are unavailable; responses label which layers are missing.

Candidate eligibility requires at least one normalized query-term overlap. For each eligible source:

```
relevance = 5 × distinct matched query terms / distinct query terms
seeded trust = 2 × clamp(analyst seed weight, 0, 10) / 10; community sources = 0
pack influence = min(2, sum over distinct public curators of best(1 / rank))
supersession penalty = 1 if explicitly superseded, else 0
retrieval score = relevance + seeded trust + pack influence − supersession penalty
```

Algorithm version `retrieval-v1`; factors and totals rounded to four decimals. Stable ID tie-breaks and ordered floating-point summation make the same corpus/query/control inputs reproducible. Repeated words do not inflate overlap; copying many packs under one curator cannot inflate that curator's contribution. This is a bounded curation signal, not a claim of Sybil resistance or measured factual reliability. No unimplemented corroboration, evidence-directness, or freshness bonus is invented.

Public signals read through an anonymous client with an explicit public filter. Private packs can restrict the caller's candidate set but never add to public adoption. Exact stored URL equality links shelf entries to seed provenance; otherwise they remain separate sources. Duplicate URL candidates collapse to a stable representative, preferring the known seed. Illustrative `.invalid` source URLs are excluded from the Explorer.

Corpus scan limits: newest 200 ready community links, newest 200 public packs, and up to 50 entries in a selected pack. Scans use ID tie-breaks; limits, read status, counts, and warnings are returned. This is a bounded corpus snapshot, not a claim to search the entire web or every pack. Pack matching and relevance are keyword-based, without semantic inference.

Response: ranking version, controls, selected-pack metadata, corpus status/limits, ranked results (numeric factors, matched terms, derivation, public pack provenance), and independent `canonical_verification`. Retrieval is navigation, not factual confidence. Canonical verification is still the OAuth/PKCE prototype, includes historical demo fixtures, and is explicitly labeled accordingly.

### Canonical isolation contract

Pipeline 0.3.0 selects up to `topK` canonical seeds independently, then appends up to `topK` labeled supplemental community sources. Therefore `/api/verify` may return up to 12 sources at its default of six per lane. Only canonical seeds affect confidence, conflicts, and staleness penalties. Community trust weights are forced to zero. Source-pack adoption, result limits, and selected packs never change the canonical verification returned by `/api/retrieve`.

### Next implementation queue

1. Activate and verify pack persistence in production (Muse migration/browser handoff).
2. Complete pack lifecycle: owner edits/deletion and attributable fork ancestry.
3. Add category hierarchy and pack comparison; define versioned graph evidence edges.
4. Add graph-backed ranking factors only when their evidence/provenance is recorded.
5. Continue frontend error recovery and broader corpus coverage without changing the settled strategy.

## Objective

Ship the MVP around the narrow, painful workflow:

claim -> source retrieval -> evidence review -> contradiction detection -> transparent trust score

The MVP is link-first, source-pack-first, and trust-engine-first. It is explicit about what is canonical versus what is community-curated and adjustable.

---

## 1) Link ingestion and source contribution flow

### Purpose

Make it easy for users to contribute live sources from the web without getting stuck in file management, ingestion complexity, or premature security hardening.

### MVP flow

1. User pastes a URL.
2. System validates it is http or https.
3. System checks for exact duplicate URLs.
4. System fetches best-effort metadata:
   - title
   - excerpt or summary text
   - hostname/domain
5. System stores a source row with:
   - id
   - kind = link
   - title
   - url
   - domain
   - category
   - tags
   - excerpt
   - status = ready | pending
   - created_at
6. Source becomes queryable for retrieval if it has enough useful text.
7. The source is labeled as community-contributed if it is user-added, not a canonical seed.

### Source packs as the core community layer

Users should also be able to create a source pack: a ranked, category-based list of trusted URLs.

Example:
- “AI security sources”
- “Trustworthy policy sources”
- “Finance explainers and official data”

A source pack is not just a bookmark list. It is a trust map.

A pack should support:
- title and description
- category
- source ordering
- share / fork / clone
- tags and notes
- public/private visibility
- user attribution

This is the real user-generated trust layer that makes the system more than a source database.

### API contract

POST /api/sources

Request body:
{
  "url": "https://example.com/article",
  "title": "Optional override title",
  "category": "security",
  "tags": ["oauth", "pkce"],
  "description": "Optional excerpt"
}

Response:
{
  "id": "uuid",
  "status": "ready"
}

### MVP rules

- Deduplicate by exact URL.
- Keep link submission simple and fast.
- Treat metadata fetch as best-effort.
- Do not over-engineer security in the first release.
- Defer SSRF hardening, rate limiting, and file security work to later.

### Data model

Source row fields:
- id
- kind
- title
- url
- domain
- description / excerpt
- category_id
- status
- created_at
- owner_id

Source pack fields:
- id
- title
- description
- category
- owner_id
- is_public
- created_at

Pack-source linkage fields:
- pack_id
- source_id
- rank
- note
- created_at

### Acceptance

- User can submit a valid URL and get back a stored source.
- Duplicate URL returns a clear duplicate response.
- Source appears in the public shelf.
- Source is searchable by title/tag/category/excerpt.
- Users can create and share a source pack for a domain.

---

## 2) Trust ranking engine design

### Purpose

This is the core secret sauce. It is the actual product engine that ranks sources by trust and determines what evidence appears strongest.

### Design principle

The ranking layer must be:
- deterministic
- public
- inspectable
- versioned
- clearly separated from community influence

Community-curated source packs contribute data, but they do not silently rewrite the canonical trust score.
The system should display their role clearly.

### Inputs to trust score

A source score should be derived from:
- source reputation / earned trust
- pack adoption and ranking position
- corroboration from other trusted sources
- claim-to-source overlap
- contradiction penalties
- freshness and supersession state
- domain relevance
- evidence quality / directness

### Target formula (future graph inputs; implemented subset specified above)

score = retrieval_overlap
      + earned_trust_weight
      + pack_adoption_weight
      + corroboration_bonus
      + freshness_bonus
      - contradiction_penalty
      - stale_or_superseded_penalty

This should be a deterministic function with explainable components.

### Trust scoring dimensions

1. Earned trust
   - current baseline signal
   - a source with strong provenance gets higher weight
   - measured track record is the long-term direction

2. Pack adoption
   - if a source appears in many trusted packs, its reliability rises
   - pack rank matters; a highly ranked source in many packs is stronger than a low-ranked one

3. Corroboration
   - if multiple trusted sources support the same fact, confidence rises
   - this should be graph-based and public

4. Contradiction
   - if the same claim is supported and contradicted, the engine surfaces both sides explicitly
   - contradiction is a trust signal, not a hidden merge

5. Freshness
   - stale or superseded guidance should be labeled as such
   - freshness is not a hidden penalty; it is shown transparently

6. Retrieval relevance
   - source must match claim terms and evidence context
   - ranking should show why a source was retrieved

### Output requirement

Every score should include:
- trust value
- derivation string
- weighted factors
- sources that contributed to the score
- contradiction summary
- source-pack influence, if any

Example:
{
  "source_id": "abc",
  "trust_score": 8.4,
  "algorithm_version": "trustrank-v1",
  "derivation": "earned_trust: 8.0 + pack_adoption: 1.2 + corroboration: 1.5 + freshness: 0.4 - contradiction: -1.5"
}

### Rules

- community votes are displayed as labeled sentiment, not silently merged
- source ranking is transparent and reproducible
- each algorithm version is versioned
- tuning settings are always visible and labeled
- pack-level trust is a signal, not the final authority

### Acceptance

- source order can be explained in plain language
- the same input yields the same score output
- contradictions are surfaced before a single confidence score is trusted
- the trust engine remains separate from the community layer
- pack adoption impacts retrieval ranking without replacing the canonical trust algorithm

---

## 3) Controls panel spec

### Purpose

The controls panel is a visible tuning layer for retrieval and output behavior. It is not the canonical trust calculator.

### Role

This is SourceSelect: a small interface that allows users to see and change session settings like:
- temperature
- top-k
- top-p
- retrieval depth
- contradiction threshold
- explanation verbosity
- source weighting preferences

### Principle

This layer should be intuitive and transparent.
It should not hide the underlying logic.
It should not pretend to be the trust engine itself.

### MVP controls

- Retrieval depth
- Top-k
- Temperature
- Top-p
- Explanation verbosity
- Show/hide contradictions
- Show/hide freshness flags

### UI behavior

- Controls are grouped by purpose.
- Every setting has a short explanation.
- Changes are session-specific unless explicitly saved.
- Interface should clearly label these as tuning controls, not canonical trust values.

### Response contract

When controls are active, the system should expose metadata like:
{
  "session_controls": {
    "top_k": 6,
    "temperature": 0.2,
    "top_p": 0.9,
    "show_contradictions": true
  },
  "controls_note": "These settings adjust retrieval and output behavior only. They do not silently alter the canonical trust score."
}

### Acceptance

- users can inspect and modify tuning settings
- settings are clearly labeled as session controls
- the canonical ranking remains visible and explainable
- controls do not fake authority or hide the evidence chain

---

## Implementation order

1. Build link ingestion MVP
2. Add user-curated source packs and category hierarchies
3. Add trust source ranking and derivation output
4. Add transparent controls panel as separate tuning layer
5. Add user-generated voting and challenge inputs as labeled secondary data
6. Revisit file upload and hardening only after the basic workflow works

---

## Final principle

The real product is the visible trust layer beneath retrieval.

We are not trying to make AI “sound right.”
We are building a source trust network that makes AI answers inspectable, challengeable, and grounded in a real evidence graph.

The trust graph is the core product asset.
The controls panel is a front-end tuning layer.
Community influence is a separate signal, not the source of truth.

The MVP should be simple, visible, and focused on delivered trust value.
