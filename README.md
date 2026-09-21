# TrustNode

A visible source trust layer for AI research: contribute links, curate source packs,
explore ranked evidence, and inspect the reasoning behind a claim's confidence.

## Start here

- [Strategy](docs/Business/STRATEGY.md) — canonical product direction.
- [Current work](docs/Implementation/TASKS.md) — what is built, next, and blocked.
- [Technical contracts](docs/Implementation/DESIGN.md) — implemented behavior and limits.
- [Charter](docs/Business/CHARTER.md) — commons principles.

Use this desktop workspace and `main` for current work. Read Strategy and Current
work before editing. Retired branches and agent handoffs are not active assignments.

## App

- `/sources`: contribute links and browse the source shelf.
- `/packs`: curate, share, and copy ordered source packs.
- `/explore`: retrieve sources with visible ranking factors and pack controls.
- `/verify`: inspect the seeded claim/evidence/confidence workflow.

Canonical verification is currently an OAuth/PKCE prototype. Retrieval ranking is
separate from factual confidence; community signals never silently change that score.

## Run locally

Use Node **22.23.2** from `.nvmrc` (`nvm install && nvm use` if using nvm).

```bash
cd app
npm ci
npm run dev
```

Open `http://localhost:3000`. Home, seeded verification, and seed-backed exploration
work without credentials. Database-backed contribution and pack flows need Supabase.
Copy `app/.env.example` to `app/.env.local`, supply the four public-project values,
and apply the source migrations (001, 001b, 001c) and source-pack migration (003)
in `db/`. Configure `/sources` as an allowed auth redirect and restart the server.
Writes use the signed-in user's JWT and RLS; no service-role key is used.

For a quick code check: `npm run typecheck`. Existing CI also runs the application
checks and production build. Keep validation focused on the change being delivered.

Production: [TrustNode](https://trustnode-lemon.vercel.app).
Code deployment and database migration activation are separate; see Current work.
