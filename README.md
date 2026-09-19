# TrustNode

The trust layer between generative AI and reality. Take an AI-generated claim —
get its sources, supporting evidence, contradictions, and provenance.

> Not another chatbot. Not an AI fact-checker asking a second model whether the
> first one was right. TrustNode grounds claims against identifiable sources and
> exposes the evidence chain.

## The narrow workflow (v0.1.0)

One workflow, done well:

```
claim → normalize → retrieve → stance → conflicts → confidence
```

- **Retrieve**: rank seeded sources by keyword overlap with the claim.
- **Stance**: each source supports / contradicts / qualifies / is unrelated to
  the claim, with the exact quote shown.
- **Conflicts**: contradictions between sources are surfaced; outdated or
  superseded sources are flagged (freshness is a first-class signal).
- **Confidence**: a transparent formula, always shown with its derivation —
  never a bare number. Community votes are displayed per source and never
  merged into the score.

The pipeline is fully **deterministic**. Per the Charter (Article VI: *AI
explains; it does not decide*), no model grades its own homework. An LLM
claim-extractor may plug in upstream later; it will never touch these numbers.

## Where trust comes from

Three signals, kept distinct:

1. **Earned trust (measured)** — track record. Currently analyst-seeded;
   real deployments measure it.
2. **Community trust (voted)** — displayed as sentiment, labeled, never
   silently merged into scores.
3. **Your trust (personal)** — your allowlist/blocklist. For your queries,
   you're the final arbiter.

Trust is per-domain. Gold on medicine can be garbage on crypto.

## Run it

```bash
cd app
npm install
npm run dev        # UI at http://localhost:3000 — try /verify
npm run typecheck
npm run build
```

`POST /api/verify` with `{ "claim": "..." }` returns the full verification chain
as JSON. The seed corpus covers OAuth/PKCE documentation (`app/data/sources.json`).

## The commons

TrustNode is built under the Trust Commons Charter — methodology, data, and
code are public, versioned, and forkable; trust is never for sale. The network
belongs to everyone; the interface and the labor are the product.

See [CHARTER.md](./CHARTER.md) (v1.0, ratified 2026-09-19).
