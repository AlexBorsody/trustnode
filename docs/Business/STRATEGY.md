# TrustNode Strategy

## Mission

TrustNode makes the hidden source graph under AI retrieval visible, user-curated, and trust-ranked.

We are not building another chatbot. We are building the trust infrastructure that sits beneath retrieval and shapes what an AI system is allowed to rely on.

## Core thesis

Search engines rank pages without showing why they matter.
AI systems retrieve information without showing which sources earned trust or how that trust was derived.
TrustNode makes that missing layer visible.

The real product is not a generic fact-checker. The real product is a visible, user-curated source trust network for domain-specific knowledge work.

The missing link in RAG is not better embeddings. It is source trust architecture:
- which sources are considered reliable
- which communities or users curate them
- how those sources are ranked in context
- which contradictions or supersessions matter
- how that trust is shown to the user without hiding the logic

## Core product engine

The central engine is the source trust graph and source-ranking system.

This determines:
- which sources are retrieved first
- which sources are treated as more authoritative in context
- how corroboration and contradiction change evidence strength
- how a source becomes trusted or discredited over time
- which user-curated source packs gain adoption and authority

This algorithm must be deterministic, explainable, and versioned.
It should be inspectable by users, not hidden inside a black box.

The admin does not own the truth. The community builds and shares the hierarchies of trusted sources.

A source list is not just a list; it is a ranking model. It is a trust map. A user’s curated list tells us which sources they believe are reliable in a category, and repeated adoption across many users becomes a powerful signal.

## The trust model

The product’s real power is in community-curated source hierarchies.

Users should be able to:
- create source lists by category
- rank the sources inside each list
- share the list publicly or privately
- fork somebody else’s list
- merge and compare lists
- see which sources are most widely trusted by the community

Examples of categories:
- technology
- finance
- politics
- medicine
- art
- music
- law
- science
- education

These are not just collections of links. They are trust graphs.

Trust emerges from:
- repeated appearance across trusted lists
- ranking position within a list
- corroboration from other high-trust curators
- domain-specific reliability
- historical accuracy and consistency
- challenge and rebuttal paths

The important part is that this is not a simple popularity contest. It is a network of evidence and trust relationships.

## Target niche

Primary niche: high-risk AI workflows where evidence matters.

This includes:
- legal and regulatory research
- compliance reviews
- policy analysis
- analyst work and due diligence
- product and market research
- medical and scientific inquiry
- reputation-sensitive internal knowledge workflows

These users are not asking for a clever chatbot. They are asking for proof, contradictions, and source traceability before a claim is acted on.

## Why this niche

This segment has the strongest combination of:
- high urgency
- high cost of error
- real willingness to pay
- strong need for source provenance
- repeated workflows that can become product habits

A wrong answer in legal, finance, medicine, or compliance is materially expensive.
A wrong answer in mainstream consumer chat is often just annoying.

## Product wedge

The wedge is not “AI fact-checking.”
The wedge is: “show the trust graph under the answer.”

The user workflow is:
1. paste or import an AI-generated claim, summary, or recommendation
2. retrieve relevant sources and source packs
3. surface their trust ranking, evidence, and corroboration
4. show contradictions, fresh vs stale sources, and provenance
5. let the user decide whether the claim is usable

This is a painful workflow because it is common, expensive to get wrong, and under-served by current tools.

## Positioning

TrustNode sits between raw AI output and human decision-making.

We do not replace judgment.
We make the evidence visible and the source graph inspectable.

We help teams answer:
- What supports this claim?
- What contradicts it?
- Which sources are trusted in this domain?
- Are the sources fresh, stale, or superseded?
- Why did the system retrieve them?
- What is the derivation behind the confidence score?

## Product promise

Before you trust an AI claim in a decision-critical workflow, we show you the evidence, the contradictions, the source graph, and the trust derivation.

## Browser-first trust architecture

TrustNode should be framed as a browser-first public-client product, not a classic backend-secret API. The browser can use the Supabase project URL and public anon key to reach the app, while the real authority sits with the signed-in user session and the database’s row-level security policies. This keeps the app transparent, inspectable, and safe: public reads, session-scoped writes, and no hidden service-role power in the frontend.

This is a product story as much as an architecture story. It fits the lane of a frontend-first, security-minded, PWA-style product that exposes the trust layer directly to users instead of burying it in a backend black box.

## Strategic principle

We win by becoming the visible trust layer beneath retrieval.

The first version should not try to become a universal truth engine for the internet.
It should become the real source-of-trust layer for domain-specific, high-value knowledge work.

The ranking engine is the core product asset. The community’s source lists are the network effect. The trust graph is the moat.

## Source packs and collective trust

Users should not just submit links. They should contribute curated source packs.

A source pack is a ranked list of trusted sources for a topic or domain. It may be public, forkable, and mergeable.

Example:
- “AI security best practices”
- “Public client OAuth sources”
- “Trusted medical sources for oncology”
- “Finance explainers and official data sources”

These packs create a social graph of trust.
The system should calculate:
- how often a source appears in trusted packs
- how highly a source is ranked within those packs
- how much overlap exists between different trusted lists
- how trust changes by category and subtopic

This is the product’s real differentiation from simple “upvote the site” mechanics.
It is not shallow popularity. It is structured, hierarchical trust curation.

## Separate tuning panel

We will also build a controls panel that lets operators adjust session-level retrieval behavior in a transparent, labeled way.

This panel may expose settings like:
- retrieval depth
- top-k selection
- source weighting knobs
- temperature or output variance controls for downstream AI summarization
- contradiction thresholds
- explanation verbosity

These knobs are for workflow tuning and operator control, not for silently changing the canonical evidence score.
They should be clearly labeled as controls for a given session or deployment, not hidden manipulations of trust.

## Why the big players are not the real threat

Large AI companies can copy the interface and even parts of the UX.
They cannot easily match a transparent, auditable trust network built around public sources, user-curated hierarchy, and explicit contradiction detection.

The moat is not better AI output alone.
The moat is public provenance, shareable source packs, deterministic evaluation, and a visible trust graph.

## The initial product

Phase 1 product focus:
- claim verification
- source retrieval
- source pack creation and sharing
- trust-ranked source lists
- contradiction detection
- freshness and supersession tracking
- transparent confidence derivation
- public, explainable trust ranking as the central engine

The trust algorithm remains the product’s core secret sauce, but it is not black-boxed.
It is public, versioned, visible, and reproducible.

User-generated source lists are not a side feature. They are the network effect that gives the engine its legitimacy and breadth.

## MVP priority order

For the MVP, the priority should be:
1. link ingestion and source contribution
2. user-curated source packs and category hierarchies
3. retrieval and trust ranking based on evidence and pack adoption
4. claim verification and contradiction display
5. community influence as a labeled secondary layer
6. file upload and extraction only after the core workflow is proven

Link ingestion matters because it allows the system to collect live evidence quickly.
Source packs matter because they capture the real trust layer: social curation and shared source reliability.

Files are useful and will matter later, but they are not the wedge for the first release. MVP speed matters more than perfect ingestion coverage.

Security hardening for file uploads, SSRF protections, MIME validation, rate limiting, and extraction robustness should be treated as post-MVP work. We should build the product and learn from real usage before over-investing in defensive complexity.

## Expansion path

Phase 1: compliance / legal / policy / analyst research
Phase 2: product and market research teams
Phase 3: community-driven knowledge graphs for everyday domains
Phase 4: broader public trust use cases after the evidence architecture proves durable

## What not to do

Avoid building:
- a broad search engine replacement
- a generic AI “truth” product for consumers
- an opaque leaderboard or trust score that hides its methodology
- a chatbot that claims to know the truth without showing the sources
- a static admin-managed source list that acts as fake authority

## Decision rule

If a feature does not improve source traceability, source trust, contradiction visibility, or evidence quality, it is not core to the product.

## Summary

TrustNode’s strategic opportunity is to own the hidden trust layer beneath AI retrieval.

The product is not “AI with a fact-checker.”
It is a visible, user-curated source trust network that sits under retrieval and makes evidence, provenance, and trust legible.

This is the missing layer in how RAG actually becomes trustworthy and useful.
