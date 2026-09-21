# TrustNode Implementation Brief

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

### Example formula (MVP)

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
