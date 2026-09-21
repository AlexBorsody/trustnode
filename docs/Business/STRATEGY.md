# TrustNode strategy

Canonical product direction. Implementation and prioritization serve this document.
Alex owns product decisions; Codex in the desktop workspace owns delivery.

## Product

TrustNode makes the source trust layer beneath AI retrieval visible and usable.
People contribute links, curate ranked source packs by topic, and inspect why
sources appear in an answer. Evidence, contradictions, provenance, and score
explanations help a person decide whether an AI-generated claim is usable.

The source network and deterministic ranking engine are the product. SourceSelect
is the interface for inspecting sources and adjusting implemented retrieval controls.
We are not building a general chatbot, a replacement search engine, or an automated
arbiter of truth.

## Who it serves

Start with domain-specific research where a wrong answer is costly: compliance,
legal and policy research, due diligence, and analyst work. The first workflow is
reviewing sources behind an AI-generated claim, summary, or recommendation.
Product and market research are adjacent uses. Broader consumer use comes later.

## Core workflow

1. Contribute a source URL with context about why it matters.
2. Create a source pack: topic, ordered links, notes, tags, owner, and visibility.
3. Share a public pack or copy an accessible pack into your own collection.
4. Explore relevant sources and see the factors behind their retrieval order.
5. Inspect supporting evidence, contradictions, freshness, and provenance before
   relying on a claim. Every confidence value includes its derivation.

## Trust model

Keep three signals explicit:

- Evidence and source authority: currently analyst-seeded; graph relationships
  and measured historical reliability are future inputs and must be labeled honestly.
- Community curation: pack adoption and curator ordering can influence retrieval
  through a published, bounded formula. Popularity does not establish factual truth.
- Personal selection: people choose the sources and packs used in their workflow.
  Session preferences must be visible and must not silently alter canonical confidence.

Canonical claim confidence stays independent of community contributions, votes,
and retrieval controls. Votes, when implemented, are labeled sentiment.
Ranking and scoring remain deterministic, inspectable, reproducible, and versioned.
AI may extract claims or explain evidence later; it does not calculate trust scores.
Paid placement never affects rank or confidence.

## Build order

1. Make link contribution and the source shelf useful end to end.
2. Make ranked source packs usable: create, share, copy, edit, and delete.
3. Connect packs to transparent retrieval and evidence review.
4. Add attributable forks, category hierarchies, and pack comparison/merge.
5. Add recorded evidence relationships and graph-derived ranking as the corpus grows.
6. Add downstream summaries and further controls only when their behavior exists.

Source packs are central: repeated, attributable curation by topic can make the
network more useful. That is a product hypothesis to prove through usage, not a
substitute for evidence. Graph authority must not be described as measured accuracy.

## Architecture and scope

Browser-first Next.js app with Supabase public-client auth. Public reads and
session-scoped writes use database row-level security; no service-role key in the app.
Links and addressable source records are primary. File uploads are an import path,
not the product's organizing model. Keep existing extraction working; defer expansion.

Ship a usable workflow before expanding infrastructure. No inert temperature/top-p
controls, unrelated social features, or broad testing projects. Use focused checks
needed for the change. Upload/SSRF/rate-limit hardening remains required before a
broader public launch, without becoming the current development focus.

The commons keeps methodology, data, and code public, versioned, and forkable.
Revenue can come from implementation, enterprise deployments, and services around
it; never from purchased authority. The long-term advantage is useful source
curation, public provenance, and an inspectable evidence graph.

## Decision rule

Build features that improve source contribution, curation, retrieval, traceability,
or evidence review. Judge progress by whether the workflow works for a user.
Current delivery status and the next task live in
[the work queue](../Implementation/TASKS.md); technical contracts live in
[the design](../Implementation/DESIGN.md). These documents implement this strategy.
